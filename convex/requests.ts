import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { actorOf, requireAdmin, requireUser } from "./lib/auth";
import {
  canDecideRequest,
  canMarkReturned,
  canTransition,
  conflictsWithApprovedLoan,
  isOverdue,
  rangesOverlap,
  todayUtc,
  validateBorrowRange,
  type RequestStatus,
} from "./lib/rules";
import type { NotifyEvent } from "./lib/automation";

async function scheduleNotification(
  ctx: MutationCtx,
  requestId: Id<"requests">,
  event: NotifyEvent,
  recipient: "owner" | "borrower",
) {
  // Runs after this transaction commits; if the mutation fails nothing is sent.
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
    requestId,
    event,
    recipient,
    attempt: 1,
  });
}

async function activityFor(ctx: QueryCtx, requestId: Id<"requests">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .order("desc")
    .take(5);
  return events.map((e) => ({ type: e.type, message: e.message, createdAt: e.createdAt }));
}

export async function hydrate(
  ctx: QueryCtx,
  r: Doc<"requests">,
  opts: { includeBorrower: boolean; includeOwner: boolean },
) {
  const tool = await ctx.db.get(r.toolId);
  const borrower = opts.includeBorrower ? await ctx.db.get(r.borrowerId) : null;
  const owner = opts.includeOwner ? await ctx.db.get(r.ownerId) : null;
  return {
    _id: r._id,
    toolId: r.toolId,
    toolCategory: tool?.category,
    decidedAt: r.decidedAt,
    returnedAt: r.returnedAt,
    updatedAt: r.updatedAt,
    status: r.status,
    startDate: r.startDate,
    endDate: r.endDate,
    createdAt: r.createdAt,
    overdue: isOverdue(r, todayUtc()),
    toolName: tool?.name ?? "Removed tool",
    toolRemoved: !!tool?.removedAt,
    // Display names only, never emails.
    borrowerName: borrower?.name,
    ownerName: owner?.name,
    ownerTrusted: owner?.trustedLender,
    activity: await activityFor(ctx, r._id),
  };
}

export const create = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const viewer = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Listing not found");
    if (tool.ownerId === viewer._id) throw new ConvexError("You cannot borrow your own tool");

    const rangeError = validateBorrowRange({ startDate, endDate }, todayUtc());
    if (rangeError) throw new ConvexError(rangeError);

    const existing = await ctx.db
      .query("requests")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    if (conflictsWithApprovedLoan({ startDate, endDate }, existing)) {
      throw new ConvexError("Those dates overlap an approved loan for this tool");
    }
    if (
      existing.some(
        (r) => r.borrowerId === viewer._id && r.status === "pending" && rangesOverlap(r, { startDate, endDate }),
      )
    ) {
      throw new ConvexError("You already have a pending request for these dates");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("requests", {
      toolId,
      ownerId: tool.ownerId,
      borrowerId: viewer._id,
      startDate,
      endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleNotification(ctx, requestId, "created", "owner");
    return requestId;
  },
});

async function loadForAction(ctx: MutationCtx, requestId: Id<"requests">) {
  const request = await ctx.db.get(requestId);
  if (!request) throw new ConvexError("Request not found");
  const tool = await ctx.db.get(request.toolId);
  if (!tool) throw new ConvexError("Tool not found");
  return { request, tool };
}

function assertTransition(from: RequestStatus, to: RequestStatus) {
  if (!canTransition(from, to)) {
    throw new ConvexError(`Cannot change a ${from} request to ${to}`);
  }
}

export const decide = mutation({
  args: {
    requestId: v.id("requests"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, { requestId, decision }) => {
    const viewer = await requireUser(ctx);
    const { request, tool } = await loadForAction(ctx, requestId);
    if (!canDecideRequest(actorOf(viewer), tool)) {
      throw new ConvexError("Only the tool's owner can approve or decline");
    }
    assertTransition(request.status, decision);

    if (decision === "approved") {
      if (tool.removedAt) throw new ConvexError("This listing has been removed");
      if (request.endDate < todayUtc()) {
        throw new ConvexError("This request's dates have already passed");
      }
      const others = await ctx.db
        .query("requests")
        .withIndex("by_tool", (q) => q.eq("toolId", request.toolId))
        .collect();
      if (
        conflictsWithApprovedLoan(
          request,
          others.filter((o) => o._id !== request._id),
        )
      ) {
        throw new ConvexError("These dates overlap a loan you already approved");
      }
    }

    const now = Date.now();
    await ctx.db.patch(requestId, { status: decision, decidedAt: now, updatedAt: now });
    await scheduleNotification(ctx, requestId, decision, "borrower");
  },
});

export const markReturned = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const viewer = await requireUser(ctx);
    const { request, tool } = await loadForAction(ctx, requestId);
    if (!canMarkReturned(actorOf(viewer), tool, request)) {
      throw new ConvexError("Only the owner or borrower can mark this loan returned");
    }
    assertTransition(request.status, "returned");
    const now = Date.now();
    await ctx.db.patch(requestId, { status: "returned", returnedAt: now, updatedAt: now });
    // Tell the other party.
    await scheduleNotification(ctx, requestId, "returned", viewer._id === request.borrowerId ? "owner" : "borrower");
  },
});

/** "My requests": things the viewer asked to borrow. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(rows.map((r) => hydrate(ctx, r, { includeBorrower: false, includeOwner: true })));
  },
});

/** "Incoming requests": requests on the viewer's own tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(rows.map((r) => hydrate(ctx, r, { includeBorrower: true, includeOwner: false })));
  },
});

/** Admin only: every loan (approved or returned), plus the parties' display names. */
export const allLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const approved = await ctx.db
      .query("requests")
      .withIndex("by_status_end", (q) => q.eq("status", "approved"))
      .collect();
    const returned = await ctx.db
      .query("requests")
      .withIndex("by_status_end", (q) => q.eq("status", "returned"))
      .order("desc")
      .take(200);
    const rows = [...approved, ...returned].sort((a, b) => b.createdAt - a.createdAt);
    return await Promise.all(rows.map((r) => hydrate(ctx, r, { includeBorrower: true, includeOwner: true })));
  },
});
