import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { actorOf, requireUser } from "./lib/auth";
import {
  LIMITS,
  canEditTool,
  canRemoveTool,
  isToolAvailable,
  normaliseText,
  todayUtc,
} from "./lib/rules";
import { categoryValidator, conditionValidator } from "./schema";

async function activeLoansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("requests")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .filter((q) => q.eq(q.field("status"), "approved"))
    .collect();
}

async function listLiveTools(ctx: QueryCtx, category?: Doc<"tools">["category"]) {
  if (category) {
    return await ctx.db
      .query("tools")
      .withIndex("by_removed_category", (q) =>
        q.eq("removedAt", undefined).eq("category", category),
      )
      .order("desc")
      .take(200);
  }
  return await ctx.db
    .query("tools")
    .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
    .order("desc")
    .take(200);
}

/**
 * PUBLIC (no auth). Returns only tools that are listed and available today,
 * and only `name` + `category`. No ids, owner ids, names or descriptions,
 * so nothing about a neighbour leaks to anonymous visitors.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await listLiveTools(ctx);
    const out: { name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of tools) {
      const loans = await activeLoansFor(ctx, tool._id);
      if (isToolAvailable(loans, today)) out.push({ name: tool.name, category: tool.category });
    }
    return out;
  },
});

/** Signed-in: all tools with availability, optionally filtered by category. */
export const listAll = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const viewer = await requireUser(ctx);
    const today = todayUtc();
    const tools = await listLiveTools(ctx, category);
    return await Promise.all(
      tools.map(async (tool) => {
        const loans = await activeLoansFor(ctx, tool._id);
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          available: isToolAvailable(loans, today),
          // Approved date ranges only (no borrower identity) so people can pick free dates.
          bookedRanges: loans.map((l) => ({ startDate: l.startDate, endDate: l.endDate })),
          // Display name + badge only; never email.
          ownerName: owner?.name ?? "Neighbour",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: tool.ownerId === viewer._id,
        };
      }),
    );
  },
});

/** Signed-in: the viewer's own listings. */
export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .filter((q) => q.eq(q.field("removedAt"), undefined))
      .order("desc")
      .collect();
    return await Promise.all(
      tools.map(async (tool) => {
        const loans = await activeLoansFor(ctx, tool._id);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          available: isToolAvailable(loans, today),
        };
      }),
    );
  },
});

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanFields(args: { name: string; description: string }) {
  return {
    name: normaliseText(args.name, LIMITS.nameMax, "Name"),
    description: normaliseText(args.description, LIMITS.descriptionMax, "Description"),
  };
}

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("tools", {
      ownerId: viewer._id, // always the caller; never taken from args
      ...cleanFields(args),
      category: args.category,
      condition: args.condition,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Listing not found");
    if (!canEditTool(actorOf(viewer), tool)) {
      throw new ConvexError("You can only edit your own listings");
    }
    await ctx.db.patch(toolId, {
      ...cleanFields(args),
      category: args.category,
      condition: args.condition,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Owner deletes their own listing, or an admin removes any listing (moderation).
 * Soft delete: history stays intact. Pending requests on it are declined
 * (and their borrowers notified). An owner cannot delete a tool that is
 * currently lent out; an admin can.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Listing not found");
    const actor = actorOf(viewer);
    if (!canRemoveTool(actor, tool)) {
      throw new ConvexError("You can only delete your own listings");
    }
    const isOwner = tool.ownerId === viewer._id;
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    if (isOwner && requests.some((r) => r.status === "approved")) {
      throw new ConvexError("This tool is on loan. Mark it returned before deleting it.");
    }
    const now = Date.now();
    for (const r of requests) {
      if (r.status === "pending") {
        await ctx.db.patch(r._id, { status: "declined", decidedAt: now, updatedAt: now });
        await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
          requestId: r._id,
          event: "declined",
          recipient: "borrower",
          attempt: 1,
        });
      }
    }
    await ctx.db.patch(toolId, {
      removedAt: now,
      removedBy: isOwner ? "owner" : "admin",
      updatedAt: now,
    });
  },
});
