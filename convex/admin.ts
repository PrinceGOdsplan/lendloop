import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { todayUtc, isOverdue } from "./lib/rules";
import { hydrate } from "./requests";

/** Admin only: lenders (users with at least one live listing) for the Trusted Lender toggle. */
export const lenders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
      .collect();
    const counts = new Map<Id<"users">, number>();
    for (const t of tools) counts.set(t.ownerId, (counts.get(t.ownerId) ?? 0) + 1);
    const activeLoans = await ctx.db
      .query("requests")
      .withIndex("by_status_end", (q) => q.eq("status", "approved"))
      .collect();
    const users = await Promise.all([...counts.keys()].map((id) => ctx.db.get(id)));
    return users
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        listings: counts.get(u._id) ?? 0,
        onLoan: activeLoans.filter((r) => r.ownerId === u._id).length,
        trustedLender: u.trustedLender,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const actor = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
    await ctx.db.insert("adminEvents", {
      actorId: actor._id,
      action: trusted ? "trusted_set" : "trusted_unset",
      targetUserId: userId,
      createdAt: Date.now(),
    });
  },
});

/** Counts and a bounded oversight window; no approval permission is added. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const statuses = ["pending", "approved", "returned", "declined"] as const;
    const groups = await Promise.all(
      statuses.map((status) =>
        ctx.db
          .query("requests")
          .withIndex("by_status_end", (q) => q.eq("status", status))
          .order("desc")
          .take(200),
      ),
    );
    const [pending, approved, returned, declined] = groups;
    const today = todayUtc();
    const listings = await ctx.db
      .query("tools")
      .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
      .collect();
    const raw = groups.flat().sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      counts: {
        pending: pending.filter((r) => r.endDate >= today).length,
        onLoan: approved.filter((r) => !isOverdue(r, today)).length,
        overdue: approved.filter((r) => isOverdue(r, today)).length,
        returned: returned.length,
        declined: declined.length,
        listings: listings.length,
      },
      rows: await Promise.all(raw.map((r) => hydrate(ctx, r, { includeBorrower: true, includeOwner: true }))),
      limited: groups.some((g) => g.length === 200),
    };
  },
});

export const auditTrail = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAdmin(ctx);
    const events = await ctx.db.query("adminEvents").withIndex("by_created").order("desc").take(20);
    return await Promise.all(
      events.map(async (e) => ({
        _id: e._id,
        action: e.action,
        createdAt: e.createdAt,
        byViewer: e.actorId === viewer._id,
        actorName: (await ctx.db.get(e.actorId))?.name ?? "Former admin",
        targetName: e.targetUserId ? ((await ctx.db.get(e.targetUserId))?.name ?? "Former neighbour") : undefined,
        toolName: e.toolId ? ((await ctx.db.get(e.toolId))?.name ?? "Removed tool") : undefined,
      })),
    );
  },
});
