import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

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
    const users = await Promise.all([...counts.keys()].map((id) => ctx.db.get(id)));
    return users
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => ({
        _id: u._id,
        name: u.name,
        listings: counts.get(u._id) ?? 0,
        trustedLender: u.trustedLender,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});
