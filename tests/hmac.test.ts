import { describe, expect, it } from "vitest";
import { hmacSha256Hex, signRequest, signingString, verifyRequest } from "../convex/lib/hmac";

const secret = "test-secret-not-real";
const now = 1_800_000_000;

describe("HMAC signing", () => {
  it("matches a known HMAC-SHA256 vector (RFC 4231 case 2)", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("binds timestamp, method, path and body into the signed string", () => {
    expect(signingString("1", "post", "/n8n/events", "{}")).toBe("1.POST./n8n/events.{}");
  });

  it("round-trips sign → verify", async () => {
    const body = JSON.stringify({ a: 1 });
    const { timestamp, signature } = await signRequest({
      secret, method: "POST", path: "/n8n/events", body, nowSeconds: now,
    });
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    const res = await verifyRequest({
      secret, method: "POST", path: "/n8n/events", body, timestamp, signature, nowSeconds: now + 10,
    });
    expect(res).toEqual({ ok: true });
  });

  async function signed(body = '{"x":1}') {
    return signRequest({ secret, method: "POST", path: "/n8n/events", body, nowSeconds: now });
  }

  it("rejects a tampered body", async () => {
    const { timestamp, signature } = await signed();
    const res = await verifyRequest({
      secret, method: "POST", path: "/n8n/events", body: '{"x":2}', timestamp, signature, nowSeconds: now,
    });
    expect(res).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a signature replayed against another path or method", async () => {
    const { timestamp, signature } = await signed();
    for (const [method, path] of [["POST", "/other"], ["GET", "/n8n/events"]]) {
      const res = await verifyRequest({
        secret, method, path, body: '{"x":1}', timestamp, signature, nowSeconds: now,
      });
      expect(res.ok).toBe(false);
    }
  });

  it("rejects the wrong secret", async () => {
    const { timestamp, signature } = await signed();
    const res = await verifyRequest({
      secret: "other", method: "POST", path: "/n8n/events", body: '{"x":1}', timestamp, signature, nowSeconds: now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects stale and future timestamps (replay window)", async () => {
    const { timestamp, signature } = await signed();
    for (const at of [now + 301, now - 301]) {
      const res = await verifyRequest({
        secret, method: "POST", path: "/n8n/events", body: '{"x":1}', timestamp, signature, nowSeconds: at,
      });
      expect(res).toEqual({ ok: false, reason: "stale_timestamp" });
    }
  });

  it("rejects missing or malformed headers", async () => {
    const base = { secret, method: "POST", path: "/p", body: "", nowSeconds: now };
    expect(await verifyRequest({ ...base, timestamp: null, signature: null })).toEqual({
      ok: false, reason: "missing_headers",
    });
    expect(await verifyRequest({ ...base, timestamp: String(now), signature: "abc" })).toEqual({
      ok: false, reason: "malformed_signature",
    });
    expect(
      await verifyRequest({ ...base, timestamp: "soon", signature: `sha256=${"a".repeat(64)}` }),
    ).toEqual({ ok: false, reason: "bad_timestamp" });
  });

  it("fails closed when no secret is configured", async () => {
    const { timestamp, signature } = await signed();
    const res = await verifyRequest({
      secret: undefined, method: "POST", path: "/n8n/events", body: '{"x":1}', timestamp, signature, nowSeconds: now,
    });
    expect(res).toEqual({ ok: false, reason: "secret_not_configured" });
    await expect(signRequest({ secret: "", method: "GET", path: "/", body: "" })).rejects.toThrow();
  });
});
