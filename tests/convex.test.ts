/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { signRequest } from "../convex/lib/hmac";

const modules = import.meta.glob("../convex/**/*.ts");
const NOW = new Date("2026-11-24T10:00:00Z");
const SECRET = "n8n-to-lendloop-test-secret";

function setup() {
  const t = convexTest(schema, modules);
  const as = (name: string, email: string) =>
    t.withIdentity({ name, email, tokenIdentifier: `https://issuer|${name}`, subject: name });
  return {
    t,
    alice: as("Alice", "alice@example.com"),
    bob: as("Bob", "bob@example.com"),
    carol: as("Carol", "carol@example.com"),
    as,
  };
}

async function makeUsers(s: ReturnType<typeof setup>) {
  for (const u of [s.alice, s.bob, s.carol]) await u.mutation(api.users.store, {});
}

async function makeAdmin(s: ReturnType<typeof setup>) {
  await s.t.mutation(internal.users.setRole, { email: "carol@example.com", role: "admin" });
}

const drill = {
  name: "Cordless drill",
  category: "power_tools" as const,
  condition: "good" as const,
  description: "18V with two batteries",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("users", () => {
  it("store creates a 'user' role row and ignores role from the client", async () => {
    const s = setup();
    await s.alice.mutation(api.users.store, {});
    const me = await s.alice.query(api.users.me, {});
    expect(me).toMatchObject({ name: "Alice", role: "user", trustedLender: false });
    // calling again is an idempotent upsert
    await s.alice.mutation(api.users.store, {});
    const rows = await s.t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
  });

  it("unauthenticated callers cannot use private functions", async () => {
    const s = setup();
    await expect(s.t.query(api.tools.listAll, {})).rejects.toThrow(/signed in/);
    await expect(s.t.mutation(api.tools.create, drill)).rejects.toThrow(/signed in/);
  });
});

describe("public list", () => {
  it("returns only name and category of available, non-removed tools", async () => {
    const s = setup();
    await makeUsers(s);
    await s.alice.mutation(api.tools.create, drill);
    const removed = await s.alice.mutation(api.tools.create, { ...drill, name: "Old saw" });
    await s.alice.mutation(api.tools.remove, { toolId: removed });
    const list = await s.t.query(api.tools.listPublic, {});
    expect(list).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
    expect(Object.keys(list[0]).sort()).toEqual(["category", "name"]);
  });

  it("hides a tool that is on loan today", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-24", endDate: "2026-11-26" });
    expect(await s.t.query(api.tools.listPublic, {})).toHaveLength(1); // pending doesn't block
    await s.alice.mutation(api.requests.decide, { requestId: req, decision: "approved" });
    expect(await s.t.query(api.tools.listPublic, {})).toHaveLength(0);
    await s.bob.mutation(api.requests.markReturned, { requestId: req });
    expect(await s.t.query(api.tools.listPublic, {})).toHaveLength(1);
  });
});

describe("listings ownership", () => {
  it("only the owner can edit or delete; others are rejected server-side", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    await expect(s.bob.mutation(api.tools.update, { toolId, ...drill, name: "Mine now" })).rejects.toThrow(
      /own listings/,
    );
    await expect(s.bob.mutation(api.tools.remove, { toolId })).rejects.toThrow(/own listings/);
    await s.alice.mutation(api.tools.update, { toolId, ...drill, name: "  Drill   v2 " });
    const tool = await s.t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.name).toBe("Drill v2");
  });

  it("validates input", async () => {
    const s = setup();
    await makeUsers(s);
    await expect(s.alice.mutation(api.tools.create, { ...drill, name: "   " })).rejects.toThrow(/required/);
    await expect(s.alice.mutation(api.tools.create, { ...drill, description: "x".repeat(501) })).rejects.toThrow(
      /at most/,
    );
  });

  it("filters the signed-in list by category and never exposes owner email", async () => {
    const s = setup();
    await makeUsers(s);
    await s.alice.mutation(api.tools.create, drill);
    await s.alice.mutation(api.tools.create, { ...drill, name: "Tent", category: "camping" });
    const camping = await s.bob.query(api.tools.listAll, { category: "camping" });
    expect(camping.map((t) => t.name)).toEqual(["Tent"]);
    expect(JSON.stringify(camping)).not.toContain("alice@example.com");
  });
});

describe("borrowing lifecycle", () => {
  it("enforces who may act on a request", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    await expect(
      s.alice.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" }),
    ).rejects.toThrow(/own tool/);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    await expect(s.bob.mutation(api.requests.decide, { requestId: req, decision: "approved" })).rejects.toThrow(
      /owner/,
    );
    await expect(s.carol.mutation(api.requests.decide, { requestId: req, decision: "approved" })).rejects.toThrow(
      /owner/,
    );
    await expect(s.alice.mutation(api.requests.markReturned, { requestId: req })).rejects.toThrow(/pending/);
    await s.alice.mutation(api.requests.decide, { requestId: req, decision: "approved" });
    await expect(s.carol.mutation(api.requests.markReturned, { requestId: req })).rejects.toThrow(/owner or borrower/);
    await s.alice.mutation(api.requests.markReturned, { requestId: req });
    await expect(s.alice.mutation(api.requests.decide, { requestId: req, decision: "declined" })).rejects.toThrow(
      /Cannot change/,
    );
  });

  it("blocks overlapping approved loans and past dates", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    await expect(
      s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-20", endDate: "2026-11-26" }),
    ).rejects.toThrow(/past/);
    const r1 = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-12-01", endDate: "2026-12-05" });
    const r2 = await s.carol.mutation(api.requests.create, { toolId, startDate: "2026-12-04", endDate: "2026-12-08" });
    await s.alice.mutation(api.requests.decide, { requestId: r1, decision: "approved" });
    await expect(s.alice.mutation(api.requests.decide, { requestId: r2, decision: "approved" })).rejects.toThrow(
      /overlap/,
    );
    await expect(
      s.carol.mutation(api.requests.create, { toolId, startDate: "2026-12-05", endDate: "2026-12-06" }),
    ).rejects.toThrow(/overlap/);
  });

  it("shows requests only to their parties", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    expect(await s.bob.query(api.requests.mine, {})).toHaveLength(1);
    expect(await s.alice.query(api.requests.incoming, {})).toHaveLength(1);
    expect(await s.carol.query(api.requests.mine, {})).toHaveLength(0);
    expect(await s.carol.query(api.requests.incoming, {})).toHaveLength(0);
  });
});

describe("admin role (enforced in Convex)", () => {
  it("normal users cannot call admin functions", async () => {
    const s = setup();
    await makeUsers(s);
    const me = await s.alice.query(api.users.me, {});
    await expect(s.bob.query(api.requests.allLoans, {})).rejects.toThrow(/Admin/);
    await expect(s.bob.query(api.admin.lenders, {})).rejects.toThrow(/Admin/);
    await expect(s.bob.mutation(api.admin.setTrustedLender, { userId: me!._id, trusted: true })).rejects.toThrow(
      /Admin/,
    );
  });

  it("admins can remove any listing, view all loans and mark trusted lenders", async () => {
    const s = setup();
    await makeUsers(s);
    await makeAdmin(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await s.alice.mutation(api.requests.decide, { requestId: req, decision: "approved" });
    // owner can't delete while lent out, admin can moderate
    await expect(s.alice.mutation(api.tools.remove, { toolId })).rejects.toThrow(/on loan/);

    const loans = await s.carol.query(api.requests.allLoans, {});
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ borrowerName: "Bob", ownerName: "Alice", status: "approved" });

    const lenders = await s.carol.query(api.admin.lenders, {});
    await s.carol.mutation(api.admin.setTrustedLender, { userId: lenders[0]._id, trusted: true });
    const list = await s.bob.query(api.tools.listAll, {});
    expect(list[0].ownerTrusted).toBe(true);

    await s.carol.mutation(api.tools.remove, { toolId });
    const tool = await s.t.run((ctx) => ctx.db.get(toolId));
    expect(tool?.removedBy).toBe("admin");
  });

  it("there is no public way to become admin", async () => {
    // setRole is an internal mutation: Convex refuses calls to it from any client.
    const users = await import("../convex/users");
    expect((users.setRole as unknown as { isInternal: boolean }).isInternal).toBe(true);
    expect((users.store as unknown as { isPublic: boolean }).isPublic).toBe(true);
  });
});

describe("admin oversight and audit trail", () => {
  it("overview and audit trail reject non-admins", async () => {
    const s = setup();
    await makeUsers(s);
    await expect(s.bob.query(api.admin.overview, {})).rejects.toThrow(/Admin access required/);
    await expect(s.bob.query(api.admin.auditTrail, {})).rejects.toThrow(/Admin access required/);
  });

  it("overview counts every status and returns display names only", async () => {
    const s = setup();
    await makeUsers(s);
    await makeAdmin(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const pending = await s.bob.mutation(api.requests.create, {
      toolId,
      startDate: "2026-11-26",
      endDate: "2026-11-27",
    });
    const approved = await s.bob.mutation(api.requests.create, {
      toolId,
      startDate: "2026-11-24",
      endDate: "2026-11-25",
    });
    await s.alice.mutation(api.requests.decide, { requestId: approved, decision: "approved" });
    const overview = await s.carol.query(api.admin.overview, {});
    expect(overview.counts).toMatchObject({ pending: 1, onLoan: 1, overdue: 0, returned: 0, declined: 0, listings: 1 });
    expect(overview.rows.map((r) => r._id).sort()).toEqual([pending, approved].sort());
    expect(overview.rows[0]).toMatchObject({ borrowerName: "Bob", ownerName: "Alice", toolId });
    expect(JSON.stringify(overview)).not.toContain("@example.com");
  });

  it("records trust changes and admin removals, but not owner deletes", async () => {
    const s = setup();
    await makeUsers(s);
    await makeAdmin(s);
    const own = await s.alice.mutation(api.tools.create, drill);
    const other = await s.alice.mutation(api.tools.create, { ...drill, name: "Ladder" });
    const [lender] = await s.carol.query(api.admin.lenders, {});
    await s.carol.mutation(api.admin.setTrustedLender, { userId: lender._id, trusted: true });
    await s.carol.mutation(api.admin.setTrustedLender, { userId: lender._id, trusted: false });
    await s.alice.mutation(api.tools.remove, { toolId: own });
    await s.carol.mutation(api.tools.remove, { toolId: other });
    const trail = await s.carol.query(api.admin.auditTrail, {});
    expect(trail.map((e) => e.action).sort()).toEqual(["listing_removed", "trusted_set", "trusted_unset"]);
    expect(trail.find((e) => e.action === "listing_removed")).toMatchObject({ actorName: "Carol", toolName: "Ladder" });
    expect(trail.find((e) => e.action === "trusted_set")).toMatchObject({ targetName: "Alice" });
  });
});

describe("reviewer seed", () => {
  it("is gated by LENDLOOP_ALLOW_SEED, idempotent and schedules nothing", async () => {
    const s = setup();
    const user = s.as("Demo User", "demo-user+clerk_test@example.com");
    const admin = s.as("Demo Admin", "demo-admin+clerk_test@example.com");
    await user.mutation(api.users.store, {});
    await admin.mutation(api.users.store, {});
    delete process.env.LENDLOOP_ALLOW_SEED;
    await expect(s.t.mutation(internal.seed.reviewerScenario, {})).rejects.toThrow(/Seeding is disabled/);
    process.env.LENDLOOP_ALLOW_SEED = "true";
    try {
      expect(await s.t.mutation(internal.seed.reviewerScenario, {})).toEqual({ created: 5 });
      expect(await s.t.mutation(internal.seed.reviewerScenario, {})).toEqual({ created: 0 });
      const incoming = await user.query(api.requests.incoming, {});
      expect(incoming.map((r) => r.status).sort()).toEqual(["approved", "approved", "pending", "returned"]);
      expect(incoming.filter((r) => r.overdue)).toHaveLength(1);
      const adminIncoming = await admin.query(api.requests.incoming, {});
      expect(adminIncoming).toHaveLength(1);
      const scheduled = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled).toHaveLength(0);
    } finally {
      delete process.env.LENDLOOP_ALLOW_SEED;
    }
  });
});

async function signedFetch(
  t: ReturnType<typeof convexTest>,
  method: "GET" | "POST",
  path: string,
  body = "",
  secret = SECRET,
) {
  const { timestamp, signature } = await signRequest({ secret, method, path, body });
  return t.fetch(path, {
    method,
    headers: {
      "x-lendloop-timestamp": timestamp,
      "x-lendloop-signature": signature,
      "content-type": "application/json",
    },
    body: method === "POST" ? body : undefined,
  });
}

describe("n8n HTTP endpoints", () => {
  async function overdueLoan() {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-24", endDate: "2026-11-25" });
    await s.alice.mutation(api.requests.decide, { requestId: req, decision: "approved" });
    // move the clock past the end date
    vi.setSystemTime(new Date("2026-11-28T09:00:00Z"));
    return { s, req };
  }

  it("rejects unsigned, wrongly signed and replay-shifted calls", async () => {
    const { s } = await overdueLoan();
    expect((await s.t.fetch("/n8n/overdue-loans", { method: "GET" })).status).toBe(401);
    expect((await signedFetch(s.t, "GET", "/n8n/overdue-loans", "", "wrong-secret")).status).toBe(401);
    const { timestamp, signature } = await signRequest({
      secret: SECRET,
      method: "GET",
      path: "/n8n/overdue-loans",
      body: "",
    });
    vi.setSystemTime(new Date(Date.now() + 10 * 60_000));
    const late = await s.t.fetch("/n8n/overdue-loans", {
      method: "GET",
      headers: { "x-lendloop-timestamp": timestamp, "x-lendloop-signature": signature },
    });
    expect(late.status).toBe(401);
  });

  it("fails closed (503) when the secret is not configured", async () => {
    const { s } = await overdueLoan();
    delete process.env.N8N_TO_LENDLOOP_SECRET;
    expect((await s.t.fetch("/n8n/overdue-loans", { method: "GET" })).status).toBe(503);
  });

  it("returns overdue loans with only borrower contact, and write-backs are idempotent", async () => {
    const { s, req } = await overdueLoan();
    const res = await signedFetch(s.t, "GET", "/n8n/overdue-loans");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.asOf).toBe("2026-11-28");
    expect(data.loans).toHaveLength(1);
    expect(data.loans[0]).toMatchObject({
      requestId: req,
      dedupeKey: `reminder:${req}:2026-11-28`,
      daysOverdue: 3,
      borrower: { name: "Bob", email: "bob@example.com" },
    });
    expect(JSON.stringify(data)).not.toContain("alice");

    const body = JSON.stringify({ requestId: req, type: "overdue_reminder", dedupeKey: data.loans[0].dedupeKey });
    const first = await signedFetch(s.t, "POST", "/n8n/events", body);
    expect(await first.json()).toEqual({ ok: true, duplicate: false });
    const retry = await signedFetch(s.t, "POST", "/n8n/events", body);
    expect(await retry.json()).toEqual({ ok: true, duplicate: true });

    const events = await s.t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.filter((e) => e.type === "overdue_reminder")).toHaveLength(1);

    // already reminded today → not returned again by the next run
    const again = await (await signedFetch(s.t, "GET", "/n8n/overdue-loans")).json();
    expect(again.loans).toHaveLength(0);

    // activity shows on the loan for the borrower
    const mine = await s.bob.query(api.requests.mine, {});
    expect(mine[0].activity.map((a) => a.message)).toContain("Overdue reminder sent to borrower");
  });

  it("rejects write-backs with mismatched or malformed keys and extra fields", async () => {
    const { s, req } = await overdueLoan();
    const bad = [
      { requestId: req, type: "overdue_reminder", dedupeKey: "reminder:someoneelse:2026-11-28" },
      { requestId: req, type: "request_notification", dedupeKey: `request:${req}:bogus` },
      { requestId: req, type: "overdue_reminder", dedupeKey: `reminder:${req}:2026-11-28`, message: "<script>" },
    ];
    for (const b of bad) {
      const res = await signedFetch(s.t, "POST", "/n8n/events", JSON.stringify(b));
      expect(res.status).toBe(400);
    }
    const notJson = await signedFetch(s.t, "POST", "/n8n/events", "not json");
    expect(notJson.status).toBe(400);
  });
});

describe("outgoing notification", () => {
  it("degrades gracefully when n8n is not configured (demo deployments)", async () => {
    const s = setup();
    await makeUsers(s);
    delete process.env.N8N_REQUEST_WEBHOOK_URL;
    delete process.env.LENDLOOP_TO_N8N_SECRET;
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await s.t.action(internal.notifications.deliver, {
      requestId: req,
      event: "created",
      recipient: "owner",
      attempt: 1,
    });
    // a second call (e.g. a retry) does not duplicate the activity row
    await s.t.action(internal.notifications.deliver, {
      requestId: req,
      event: "created",
      recipient: "owner",
      attempt: 1,
    });
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
    const events = await s.t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.map((e) => e.type)).toEqual(["notification_skipped"]);
    // the borrowing flow itself is unaffected
    await s.alice.mutation(api.requests.decide, { requestId: req, decision: "approved" });
    const mine = await s.bob.query(api.requests.mine, {});
    expect(mine[0].status).toBe("approved");
    expect(mine[0].activity[0].message).toMatch(/isn't configured/);
  });

  it("payload contains only the recipient's contact, not the other party's", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    const p = await s.t.query(internal.notifications.payloadFor, {
      requestId: req,
      event: "created",
      recipient: "owner",
    });
    expect(p).toMatchObject({
      deliveryId: `request:${req}:created`,
      event: "created",
      toolName: "Cordless drill",
      recipient: { role: "owner", email: "alice@example.com" },
    });
    expect(JSON.stringify(p)).not.toContain("bob");
  });

  it("signs the webhook, and records a visible failure after non-retryable errors", async () => {
    const s = setup();
    await makeUsers(s);
    const toolId = await s.alice.mutation(api.tools.create, drill);
    const req = await s.bob.mutation(api.requests.create, { toolId, startDate: "2026-11-25", endDate: "2026-11-26" });
    process.env.N8N_REQUEST_WEBHOOK_URL = "https://n8n.example.test/webhook/lendloop-request";
    process.env.LENDLOOP_TO_N8N_SECRET = "lendloop-to-n8n-test";
    const calls: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response("bad signature", { status: 401 });
      }),
    );
    await s.t.action(internal.notifications.deliver, {
      requestId: req,
      event: "created",
      recipient: "owner",
      attempt: 1,
    });
    vi.unstubAllGlobals();
    expect(calls).toHaveLength(1);
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["x-lendloop-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    const events = await s.t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.map((e) => e.type)).toEqual(["notification_failed"]);
  });
});
