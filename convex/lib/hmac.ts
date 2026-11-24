/**
 * HMAC-SHA256 request signing shared by both directions of the n8n integration.
 *
 * Wire format (same idea as Stripe / Slack signatures):
 *   x-lendloop-timestamp: <unix seconds>
 *   x-lendloop-signature: sha256=<lowercase hex HMAC>
 *
 * Signed string: `${timestamp}.${METHOD}.${path}.${rawBody}`
 *   - METHOD is upper-case ("GET" / "POST").
 *   - path is the logical route, e.g. "/n8n/overdue-loans" or "/lendloop-request".
 *     Binding method + path stops a signature captured for one endpoint being replayed on another.
 *   - rawBody is the exact bytes sent ("" for GET). We never re-serialise JSON before verifying.
 *
 * Verification rejects missing headers, malformed signatures, timestamps outside the
 * tolerance window (replay protection) and compares in constant time.
 *
 * Uses only Web Crypto so it runs unchanged in the Convex runtime, Node 18+ and vitest.
 */

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const DEFAULT_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

export function signingString(
  timestamp: string,
  method: string,
  path: string,
  body: string,
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(sig);
}

/** Constant-time comparison of two equal-length strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signRequest(opts: {
  secret: string;
  method: string;
  path: string;
  body: string;
  nowSeconds?: number;
}): Promise<{ timestamp: string; signature: string }> {
  if (!opts.secret) throw new Error("Signing secret is not configured");
  const timestamp = String(opts.nowSeconds ?? Math.floor(Date.now() / 1000));
  const hex = await hmacSha256Hex(
    opts.secret,
    signingString(timestamp, opts.method, opts.path, opts.body),
  );
  return { timestamp, signature: `sha256=${hex}` };
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "secret_not_configured"
        | "missing_headers"
        | "malformed_signature"
        | "bad_timestamp"
        | "stale_timestamp"
        | "signature_mismatch";
    };

export async function verifyRequest(opts: {
  secret: string | undefined;
  method: string;
  path: string;
  body: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): Promise<VerifyResult> {
  // Fail closed: an unset secret must never mean "accept everything".
  if (!opts.secret) return { ok: false, reason: "secret_not_configured" };
  if (!opts.timestamp || !opts.signature) return { ok: false, reason: "missing_headers" };

  const match = /^sha256=([0-9a-f]{64})$/.exec(opts.signature.trim());
  if (!match) return { ok: false, reason: "malformed_signature" };

  if (!/^\d{1,12}$/.test(opts.timestamp)) return { ok: false, reason: "bad_timestamp" };
  const ts = Number(opts.timestamp);
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - ts) > tolerance) return { ok: false, reason: "stale_timestamp" };

  const expected = await hmacSha256Hex(
    opts.secret,
    signingString(opts.timestamp, opts.method, opts.path, opts.body),
  );
  if (!timingSafeEqual(expected, match[1])) return { ok: false, reason: "signature_mismatch" };
  return { ok: true };
}
