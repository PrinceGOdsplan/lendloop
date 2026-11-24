import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer } from "./lib/auth";

/**
 * Upsert the signed-in user's row from their Clerk identity.
 * Only name/email are taken from the (verified) JWT. Role and trustedLender are
 * never accepted from the client.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const name =
      identity.name?.trim() ||
      [identity.givenName, identity.familyName].filter(Boolean).join(" ").trim() ||
      identity.nickname ||
      "Neighbour";
    const email = identity.email ?? undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch(existing._id, { name, email });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      trustedLender: false,
      createdAt: Date.now(),
    });
  },
});

/** The current viewer's own profile (role is returned so the UI can show admin links; Convex still enforces it). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/**
 * Manual admin promotion. Internal functions cannot be called from the browser;
 * run from the Convex dashboard (Functions → users:setRole) or the CLI:
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("user"), v.literal("admin")) },
  handler: async (ctx, { email, role }) => {
    const matches = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.trim()))
      .collect();
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one user with that email, found ${matches.length}`);
    }
    await ctx.db.patch(matches[0]._id, { role });
    return { userId: matches[0]._id, role };
  },
});
