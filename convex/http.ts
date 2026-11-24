import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRequest } from "./lib/hmac";

/**
 * HTTP endpoints called by n8n. Both require an HMAC signature made with
 * N8N_TO_LENDLOOP_SECRET (a different secret from the one Convex uses to sign
 * outgoing webhooks, so each side can only impersonate itself).
 */
const http = httpRouter();
const MAX_BODY_BYTES = 8 * 1024;

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function authenticate(request: Request, path: string, body: string) {
  const result = await verifyRequest({
    secret: process.env.N8N_TO_LENDLOOP_SECRET,
    method: request.method,
    path,
    body,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
  });
  if (!result.ok) {
    // Log the reason server-side; give the caller nothing to probe with.
    console.warn(`[http] rejected ${request.method} ${path}: ${result.reason}`);
    return json(result.reason === "secret_not_configured" ? 503 : 401, {
      error: "unauthorized",
    });
  }
  return null;
}

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const denied = await authenticate(request, "/n8n/overdue-loans", "");
    if (denied) return denied;
    const result = await ctx.runQuery(internal.automation.overdueLoans, {});
    return json(200, result);
  }),
});

const eventBody = z
  .object({
    requestId: z.string().min(1).max(64),
    type: z.enum(["request_notification", "overdue_reminder"]),
    dedupeKey: z.string().min(1).max(128),
    recipientRole: z.enum(["owner", "borrower"]).optional(),
  })
  .strict();

http.route({
  path: "/n8n/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return json(413, { error: "payload too large" });

    const denied = await authenticate(request, "/n8n/events", body);
    if (denied) return denied;

    let parsed;
    try {
      parsed = eventBody.safeParse(JSON.parse(body));
    } catch {
      return json(400, { error: "invalid JSON" });
    }
    if (!parsed.success) return json(400, { error: "invalid payload" });

    const result = await ctx.runMutation(internal.automation.recordEvent, parsed.data);
    if (!result.ok) return json(result.status, { error: result.error });
    // 200 for both first write and duplicate retry: the caller's goal is achieved either way.
    return json(200, { ok: true, duplicate: result.duplicate });
  }),
});

export default http;
