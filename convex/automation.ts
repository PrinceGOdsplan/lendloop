import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  REMINDER_MESSAGE,
  notificationMessage,
  parseDedupeKey,
  reminderKey,
} from "./lib/automation";
import { daysBetween, todayUtc } from "./lib/rules";

/**
 * Overdue = approved, not returned, end date before today (UTC).
 * Loans that already have today's reminder recorded are skipped, so a re-run
 * of the daily workflow does not remind the same borrower twice.
 * Returns only what the reminder needs: no owner data.
 */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("requests")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(500);

    const out = [];
    for (const loan of loans) {
      const dedupeKey = reminderKey(loan._id, today);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      if (already) continue;
      const tool = await ctx.db.get(loan.toolId);
      const borrower = await ctx.db.get(loan.borrowerId);
      out.push({
        requestId: loan._id,
        dedupeKey,
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        borrower: { name: borrower?.name ?? "Neighbour", email: borrower?.email ?? null },
      });
    }
    return { asOf: today, loans: out };
  },
});

/**
 * Idempotent write-back from n8n. The dedupe key is the idempotency key:
 * if a row with that key exists we return `duplicate: true` and change nothing.
 * Convex mutations are serializable transactions, so two concurrent retries
 * cannot both insert.
 */
export const recordEvent = internalMutation({
  args: {
    requestId: v.string(),
    type: v.union(v.literal("request_notification"), v.literal("overdue_reminder")),
    dedupeKey: v.string(),
    recipientRole: v.optional(v.union(v.literal("owner"), v.literal("borrower"))),
  },
  handler: async (ctx, args) => {
    const requestId = ctx.db.normalizeId("requests", args.requestId);
    if (!requestId) return { ok: false as const, status: 404, error: "unknown request" };
    const request = await ctx.db.get(requestId);
    if (!request) return { ok: false as const, status: 404, error: "unknown request" };

    const parsed = parseDedupeKey(args.dedupeKey, requestId, args.type, todayUtc());
    if (!parsed.ok) return { ok: false as const, status: 400, error: parsed.reason };

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    if (existing) return { ok: true as const, duplicate: true, eventId: existing._id };

    const message =
      args.type === "overdue_reminder"
        ? REMINDER_MESSAGE
        : notificationMessage(parsed.event!, args.recipientRole ?? "owner");

    const eventId = await ctx.db.insert("automationEvents", {
      requestId,
      type: args.type,
      dedupeKey: args.dedupeKey,
      message,
      createdAt: Date.now(),
    });
    return { ok: true as const, duplicate: false, eventId };
  },
});
