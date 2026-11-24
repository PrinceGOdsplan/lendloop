import { ConvexError } from "convex/values";

/**
 * Pure business rules (no Convex imports) so they can be unit-tested directly
 * and reused by queries, mutations and HTTP actions.
 *
 * Dates are calendar days stored as "YYYY-MM-DD" strings and compared in UTC.
 * Lexicographic comparison of that format is the same as chronological order.
 */

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITIONS = ["like_new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well used",
};

export type RequestStatus = "pending" | "approved" | "declined" | "returned";
export type Role = "user" | "admin";

export const LIMITS = {
  nameMax: 80,
  descriptionMax: 500,
  maxLoanDays: 60,
  maxAdvanceDays: 365,
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type DateRange = { startDate: string; endDate: string };

/** Inclusive overlap of two calendar-day ranges. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Returns an error message, or null if the requested range is acceptable. */
export function validateBorrowRange(range: DateRange, today: string): string | null {
  if (!isValidDate(range.startDate) || !isValidDate(range.endDate)) {
    return "Dates must be valid YYYY-MM-DD values";
  }
  if (range.startDate < today) return "Start date cannot be in the past";
  if (range.endDate < range.startDate) return "End date must be on or after the start date";
  if (daysBetween(range.startDate, range.endDate) + 1 > LIMITS.maxLoanDays) {
    return `Loans can be at most ${LIMITS.maxLoanDays} days`;
  }
  if (daysBetween(today, range.startDate) > LIMITS.maxAdvanceDays) {
    return "Start date is too far in the future";
  }
  return null;
}

type LoanLike = DateRange & { status: RequestStatus };

/** An approved loan that has not been returned blocks its dates. */
export function isActiveLoan(r: { status: RequestStatus }): boolean {
  return r.status === "approved";
}

/**
 * A tool is available unless it has an approved, unreturned loan whose
 * range includes today. Pending requests do not make it unavailable.
 */
export function isToolAvailable(requests: LoanLike[], today: string): boolean {
  return !requests.some(
    (r) => isActiveLoan(r) && r.startDate <= today && today <= r.endDate,
  );
}

/** Approving `candidate` must not overlap another approved, unreturned loan. */
export function conflictsWithApprovedLoan(
  candidate: DateRange,
  others: LoanLike[],
): boolean {
  return others.some((r) => isActiveLoan(r) && rangesOverlap(candidate, r));
}

/** Overdue = approved, not returned, and the end date is before today. */
export function isOverdue(r: LoanLike, today: string): boolean {
  return r.status === "approved" && r.endDate < today;
}

// ---- Authorization rules -------------------------------------------------

export type Actor = { id: string; role: Role };

export function isAdmin(actor: Actor): boolean {
  return actor.role === "admin";
}

/** Only the owner may edit a listing. Admins moderate (remove) but do not edit. */
export function canEditTool(actor: Actor, tool: { ownerId: string }): boolean {
  return tool.ownerId === actor.id;
}

/** Owners can delete their own listing; admins can remove any listing. */
export function canRemoveTool(actor: Actor, tool: { ownerId: string }): boolean {
  return tool.ownerId === actor.id || isAdmin(actor);
}

/** Approve / decline: only the owner of the tool. */
export function canDecideRequest(actor: Actor, tool: { ownerId: string }): boolean {
  return tool.ownerId === actor.id;
}

/** Mark returned: the tool owner or the borrower (the two parties of the loan). */
export function canMarkReturned(
  actor: Actor,
  tool: { ownerId: string },
  request: { borrowerId: string },
): boolean {
  return tool.ownerId === actor.id || request.borrowerId === actor.id;
}

/** Can a request be read by this actor? Parties of the loan, or an admin. */
export function canViewRequest(
  actor: Actor,
  tool: { ownerId: string },
  request: { borrowerId: string },
): boolean {
  return canMarkReturned(actor, tool, request) || isAdmin(actor);
}

/** Allowed status transitions. Anything else is rejected. */
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ["approved", "declined"],
  approved: ["returned"],
  declined: [],
  returned: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function normaliseText(value: string, max: number, field: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new ConvexError(`${field} is required`);
  if (trimmed.length > max) throw new ConvexError(`${field} must be at most ${max} characters`);
  return trimmed;
}
