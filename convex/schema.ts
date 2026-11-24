import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const conditionValidator = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const statusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
);

export const automationTypeValidator = v.union(
  v.literal("request_notification"),
  v.literal("notification_failed"),
  v.literal("notification_skipped"),
  v.literal("overdue_reminder"),
);

export default defineSchema({
  adminEvents: defineTable({
    actorId: v.id("users"),
    action: v.union(v.literal("trusted_set"), v.literal("trusted_unset"), v.literal("listing_removed")),
    targetUserId: v.optional(v.id("users")),
    toolId: v.optional(v.id("tools")),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  users: defineTable({
    // Clerk identity `tokenIdentifier` (issuer + subject): globally unique, never reused.
    tokenIdentifier: v.string(),
    name: v.string(),
    // Used only by the notification / reminder workflows. Never returned to other users.
    email: v.optional(v.string()),
    // Role is NEVER written from client input. Default "user"; promote via the
    // Convex dashboard or the internal `admin:setRole` function (see README).
    role: v.union(v.literal("user"), v.literal("admin")),
    trustedLender: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    // Soft delete so historical loans still resolve their tool name.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_removed", ["removedAt"])
    .index("by_removed_category", ["removedAt", "category"]),

  // One table for requests and loans: a request becomes a loan once approved.
  requests: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"), // denormalised from the tool for cheap "incoming" queries
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD (UTC calendar day)
    endDate: v.string(),
    status: statusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status_end", ["status", "endDate"]),

  // Audit trail of automation results + the idempotency ledger for n8n write-backs.
  automationEvents: defineTable({
    requestId: v.id("requests"),
    type: automationTypeValidator,
    dedupeKey: v.string(),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_dedupe", ["dedupeKey"])
    .index("by_request", ["requestId"]),
});
