import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { signRequest, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import {
  MAX_DELIVERY_ATTEMPTS,
  backoffMs,
  failureKey,
  isRetryableStatus,
  notificationKey,
  type NotifyEvent,
} from "./lib/automation";

const eventValidator = v.union(
  v.literal("created"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
);
const recipientValidator = v.union(v.literal("owner"), v.literal("borrower"));

/** Logical route name included in the signature (see lib/hmac.ts). */
export const REQUEST_WEBHOOK_ROUTE = "/lendloop-request";

/**
 * Builds the minimal payload for the request-notification workflow:
 * only what n8n needs to tell ONE person what happened. The other party's
 * email/profile is never included.
 */
export const payloadFor = internalQuery({
  args: { requestId: v.id("requests"), event: eventValidator, recipient: recipientValidator },
  handler: async (ctx, { requestId, event, recipient }) => {
    const request = await ctx.db.get(requestId);
    if (!request) return null;
    const tool = await ctx.db.get(request.toolId);
    const person = await ctx.db.get(recipient === "owner" ? request.ownerId : request.borrowerId);
    return {
      deliveryId: notificationKey(requestId, event), // doubles as the idempotency key
      event,
      requestId,
      status: request.status,
      toolName: tool?.name ?? "a tool",
      startDate: request.startDate,
      endDate: request.endDate,
      recipient: {
        role: recipient,
        name: person?.name ?? "Neighbour",
        email: person?.email ?? null,
      },
    };
  },
});

export const recordFailure = internalMutation({
  args: { requestId: v.id("requests"), event: eventValidator, reason: v.string() },
  handler: async (ctx, { requestId, event, reason }) => {
    const dedupeKey = failureKey(requestId, event);
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (existing) return;
    await ctx.db.insert("automationEvents", {
      requestId,
      type: "notification_failed",
      dedupeKey,
      message: `Notification could not be delivered (${reason})`,
      createdAt: Date.now(),
    });
  },
});

/**
 * Signs and POSTs one request event to the n8n webhook, retrying transient
 * failures with exponential backoff via the scheduler. After the final failed
 * attempt it records a visible `notification_failed` event on the loan and
 * logs an error, so delivery never fails silently.
 */
export const deliver = internalAction({
  args: {
    requestId: v.id("requests"),
    event: eventValidator,
    recipient: recipientValidator,
    attempt: v.number(),
  },
  handler: async (ctx, { requestId, event, recipient, attempt }) => {
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_TO_N8N_SECRET;
    if (!url || !secret) {
      console.warn(
        `[notify] skipped ${event} for ${requestId}: N8N_REQUEST_WEBHOOK_URL / LENDLOOP_TO_N8N_SECRET not set`,
      );
      await ctx.runMutation(internal.notifications.recordFailure, {
        requestId,
        event,
        reason: "automation not configured",
      });
      return;
    }

    const payload = await ctx.runQuery(internal.notifications.payloadFor, {
      requestId,
      event,
      recipient,
    });
    if (!payload) return; // request no longer exists

    const body = JSON.stringify({ ...payload, attempt });
    const { timestamp, signature } = await signRequest({
      secret,
      method: "POST",
      path: REQUEST_WEBHOOK_ROUTE,
      body,
    });

    let status: number | null = null;
    let detail = "";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      if (res.ok) {
        console.log(`[notify] delivered ${payload.deliveryId} (attempt ${attempt})`);
        return;
      }
      detail = `HTTP ${res.status}`;
    } catch (err) {
      detail = err instanceof Error ? err.name : "network error";
    }

    if (isRetryableStatus(status) && attempt < MAX_DELIVERY_ATTEMPTS) {
      const delay = backoffMs(attempt);
      console.warn(
        `[notify] ${payload.deliveryId} attempt ${attempt} failed (${detail}); retrying in ${delay / 1000}s`,
      );
      await ctx.scheduler.runAfter(delay, internal.notifications.deliver, {
        requestId,
        event,
        recipient,
        attempt: attempt + 1,
      });
      return;
    }

    console.error(
      `[notify] giving up on ${payload.deliveryId} after ${attempt} attempt(s): ${detail}`,
    );
    await ctx.runMutation(internal.notifications.recordFailure, {
      requestId,
      event: event as NotifyEvent,
      reason: detail,
    });
  },
});
