import { describe, expect, it } from "vitest";
import {
  canDecideRequest, canEditTool, canMarkReturned, canRemoveTool, canTransition,
  conflictsWithApprovedLoan, isOverdue, isToolAvailable, isValidDate, rangesOverlap,
  validateBorrowRange,
} from "../convex/lib/rules";
import { isRetryableStatus, parseDedupeKey, backoffMs } from "../convex/lib/automation";

const today = "2026-11-24";
const owner = { id: "u_owner", role: "user" as const };
const borrower = { id: "u_borrower", role: "user" as const };
const stranger = { id: "u_stranger", role: "user" as const };
const admin = { id: "u_admin", role: "admin" as const };
const tool = { ownerId: "u_owner" };
const request = { borrowerId: "u_borrower" };

describe("availability", () => {
  it("is available with no loans or only pending/declined/returned ones", () => {
    expect(isToolAvailable([], today)).toBe(true);
    for (const status of ["pending", "declined", "returned"] as const) {
      expect(isToolAvailable([{ status, startDate: "2026-11-20", endDate: "2026-11-30" }], today)).toBe(true);
    }
  });
  it("is unavailable while an approved loan covers today (inclusive)", () => {
    expect(isToolAvailable([{ status: "approved", startDate: today, endDate: today }], today)).toBe(false);
    expect(isToolAvailable([{ status: "approved", startDate: "2026-11-20", endDate: "2026-11-30" }], today)).toBe(false);
  });
  it("is available when the only approved loan starts in the future", () => {
    expect(isToolAvailable([{ status: "approved", startDate: "2026-11-25", endDate: "2026-11-30" }], today)).toBe(true);
  });
  it("stays unavailable while a loan is overdue (ended but not returned)", () => {
    expect(isToolAvailable([{ status: "approved", startDate: "2026-11-01", endDate: "2026-11-23" }], today)).toBe(false);
    expect(isToolAvailable([{ status: "returned", startDate: "2026-11-01", endDate: "2026-11-23" }], today)).toBe(true);
  });
});

describe("overlap and overdue", () => {
  it("detects inclusive overlap", () => {
    expect(rangesOverlap({ startDate: "2026-12-01", endDate: "2026-12-05" }, { startDate: "2026-12-05", endDate: "2026-12-09" })).toBe(true);
    expect(rangesOverlap({ startDate: "2026-12-01", endDate: "2026-12-04" }, { startDate: "2026-12-05", endDate: "2026-12-09" })).toBe(false);
  });
  it("only approved loans block approval", () => {
    const c = { startDate: "2026-12-01", endDate: "2026-12-03" };
    expect(conflictsWithApprovedLoan(c, [{ ...c, status: "pending" }])).toBe(false);
    expect(conflictsWithApprovedLoan(c, [{ ...c, status: "returned" }])).toBe(false);
    expect(conflictsWithApprovedLoan(c, [{ ...c, status: "approved" }])).toBe(true);
  });
  it("overdue means approved and ended before today", () => {
    expect(isOverdue({ status: "approved", startDate: "2026-11-01", endDate: "2026-11-23" }, today)).toBe(true);
    expect(isOverdue({ status: "approved", startDate: "2026-11-01", endDate: today }, today)).toBe(false);
    expect(isOverdue({ status: "returned", startDate: "2026-11-01", endDate: "2026-11-02" }, today)).toBe(false);
  });
});

describe("date validation", () => {
  it("validates real calendar dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-1-5")).toBe(false);
  });
  it("validates borrow ranges", () => {
    expect(validateBorrowRange({ startDate: today, endDate: today }, today)).toBeNull();
    expect(validateBorrowRange({ startDate: "2026-11-23", endDate: today }, today)).toMatch(/past/);
    expect(validateBorrowRange({ startDate: "2026-11-26", endDate: "2026-11-25" }, today)).toMatch(/on or after/);
    expect(validateBorrowRange({ startDate: today, endDate: "2027-03-01" }, today)).toMatch(/at most/);
    expect(validateBorrowRange({ startDate: "2028-01-01", endDate: "2028-01-02" }, today)).toMatch(/too far/);
  });
});

describe("authorization rules", () => {
  it("only the owner edits; admins do not edit others' listings", () => {
    expect(canEditTool(owner, tool)).toBe(true);
    expect(canEditTool(stranger, tool)).toBe(false);
    expect(canEditTool(admin, tool)).toBe(false);
  });
  it("owner or admin can remove a listing", () => {
    expect(canRemoveTool(owner, tool)).toBe(true);
    expect(canRemoveTool(admin, tool)).toBe(true);
    expect(canRemoveTool(stranger, tool)).toBe(false);
  });
  it("only the owner can approve/decline (not borrower, not admin)", () => {
    expect(canDecideRequest(owner, tool)).toBe(true);
    expect(canDecideRequest(borrower, tool)).toBe(false);
    expect(canDecideRequest(admin, tool)).toBe(false);
  });
  it("owner or borrower can mark returned; strangers cannot", () => {
    expect(canMarkReturned(owner, tool, request)).toBe(true);
    expect(canMarkReturned(borrower, tool, request)).toBe(true);
    expect(canMarkReturned(stranger, tool, request)).toBe(false);
  });
  it("enforces the status state machine", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("pending", "returned")).toBe(false);
    expect(canTransition("approved", "returned")).toBe(true);
    expect(canTransition("declined", "approved")).toBe(false);
    expect(canTransition("returned", "approved")).toBe(false);
  });
});

describe("automation helpers", () => {
  it("validates dedupe keys against the request and type", () => {
    expect(parseDedupeKey("request:r1:approved", "r1", "request_notification", today)).toEqual({ ok: true, event: "approved" });
    expect(parseDedupeKey("request:r2:approved", "r1", "request_notification", today).ok).toBe(false);
    expect(parseDedupeKey("request:r1:hacked", "r1", "request_notification", today).ok).toBe(false);
    expect(parseDedupeKey("reminder:r1:2026-11-24", "r1", "overdue_reminder", today)).toEqual({ ok: true, day: today });
    expect(parseDedupeKey("reminder:r1:2026-11-25", "r1", "overdue_reminder", today).ok).toBe(false);
    expect(parseDedupeKey("reminder:r1:2026-11-24", "r1", "request_notification", today).ok).toBe(false);
  });
  it("retries only transient failures, with capped backoff", () => {
    expect(isRetryableStatus(null)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(600_000);
  });
});
