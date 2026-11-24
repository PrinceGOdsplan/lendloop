import { deriveState, type StateRow } from "./format";

type Row = StateRow & { updatedAt?: number; createdAt: number };

export type Bucket = "pending" | "active" | "history";

/** Needs-action first, then active loans (by due date), then history (latest first). */
export function bucketOf(row: StateRow, today?: string): Bucket {
  const s = deriveState(row, today);
  if (s === "pending") return "pending";
  if (s === "scheduled" || s === "onloan" || s === "overdue") return "active";
  return "history";
}

export function sortRequests<T extends Row>(rows: T[], today?: string): T[] {
  const rank = { pending: 0, active: 1, history: 2 } as const;
  return [...rows].sort((a, b) => {
    const ba = bucketOf(a, today);
    const bb = bucketOf(b, today);
    if (ba !== bb) return rank[ba] - rank[bb];
    if (ba === "history") return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
    if (ba === "active") return a.endDate.localeCompare(b.endDate);
    return a.startDate.localeCompare(b.startDate);
  });
}
