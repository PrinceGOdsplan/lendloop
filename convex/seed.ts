import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { todayUtc } from "./lib/rules";

/**
 * Development helpers. These are INTERNAL functions: browsers cannot call them,
 * only the Convex dashboard / CLI (`npx convex run seed:demo`). They also refuse
 * to run unless LENDLOOP_ALLOW_SEED=true is set on the deployment, so they are
 * inert on production even if deployed.
 */
function assertAllowed() {
  if (process.env.LENDLOOP_ALLOW_SEED !== "true") {
    throw new Error("Seeding is disabled. Set LENDLOOP_ALLOW_SEED=true on a dev deployment.");
  }
}

async function demoUser(ctx: MutationCtx, key: string, name: string, email?: string) {
  const tokenIdentifier = `demo|${key}`;
  const existing = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("users", {
    tokenIdentifier,
    name,
    email,
    role: "user",
    trustedLender: false,
    createdAt: Date.now(),
  });
}

const DEMO_TOOLS = [
  { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V drill/driver, two batteries and a bit set." },
  { name: "Hedge trimmer", category: "garden", condition: "like_new", description: "Electric, 50cm blade. Extension cable not included." },
  { name: "Stand mixer", category: "kitchen", condition: "good", description: "5L bowl with whisk, paddle and dough hook." },
  { name: "4-person tent", category: "camping", condition: "fair", description: "Dome tent, pitches in 10 minutes. One pole is taped but solid." },
  { name: "Pressure washer", category: "cleaning", condition: "good", description: "Great for patios and bikes. Bring your own hose." },
] as const;

/** Two demo neighbours and a handful of tools so the public page has data. */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertAllowed();
    const ada = await demoUser(ctx, "ada", "Ada (demo)");
    const now = Date.now();
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ada))
      .collect();
    if (existing.length > 0) return { created: 0 };
    for (const t of DEMO_TOOLS) {
      await ctx.db.insert("tools", { ownerId: ada, ...t, createdAt: now, updatedAt: now });
    }
    return { created: DEMO_TOOLS.length };
  },
});

/**
 * Creates an approved loan that ended `daysAgo` days ago, so the overdue
 * workflow has something to remind about. Borrower email is a placeholder.
 */
export const overdueLoan = internalMutation({
  args: { daysAgo: v.optional(v.number()), borrowerEmail: v.optional(v.string()) },
  handler: async (ctx, { daysAgo = 2, borrowerEmail = "borrower@example.com" }) => {
    assertAllowed();
    const owner = await demoUser(ctx, "ada", "Ada (demo)");
    const borrower = await demoUser(ctx, "ben", "Ben (demo)", borrowerEmail);
    const now = Date.now();
    const day = (offset: number) => todayUtc(now + offset * 86_400_000);
    const toolId = await ctx.db.insert("tools", {
      ownerId: owner,
      name: "Ladder (demo overdue)",
      category: "hand_tools",
      condition: "good",
      description: "Demo item for the overdue reminder workflow.",
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("requests", {
      toolId,
      ownerId: owner,
      borrowerId: borrower,
      startDate: day(-(daysAgo + 3)),
      endDate: day(-daysAgo),
      status: "approved",
      createdAt: now,
      updatedAt: now,
      decidedAt: now,
    });
  },
});

/** Creates a pending request from the demo borrower and fires the "created" webhook. */
export const pendingRequest = internalMutation({
  args: { ownerEmail: v.optional(v.string()) },
  handler: async (ctx, { ownerEmail = "owner@example.com" }) => {
    assertAllowed();
    const owner = await demoUser(ctx, "olu", "Olu (demo)", ownerEmail);
    const borrower = await demoUser(ctx, "ben", "Ben (demo)", "borrower@example.com");
    const now = Date.now();
    const toolId = await ctx.db.insert("tools", {
      ownerId: owner,
      name: "Wheelbarrow (demo)",
      category: "garden",
      condition: "good",
      description: "Demo item for the request notification workflow.",
      createdAt: now,
      updatedAt: now,
    });
    const requestId = await ctx.db.insert("requests", {
      toolId,
      ownerId: owner,
      borrowerId: borrower,
      startDate: todayUtc(now + 86_400_000),
      endDate: todayUtc(now + 3 * 86_400_000),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, {
      requestId,
      event: "created",
      recipient: "owner",
      attempt: 1,
    });
    return requestId;
  },
});
