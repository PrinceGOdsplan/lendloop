import { describe, expect, it } from "vitest";
import { deriveState, dueLabel, formatDay, rangeDays } from "../lib/format";
import { sortRequests } from "../lib/requestFilters";

const today = "2026-11-24";
const row = (status: "pending" | "approved" | "declined" | "returned", startDate: string, endDate: string) => ({
  status,
  startDate,
  endDate,
});

describe("deriveState", () => {
  it("derives display states from status and dates", () => {
    expect(deriveState(row("pending", "2026-11-25", "2026-11-26"), today)).toBe("pending");
    expect(deriveState(row("pending", "2026-11-24", "2026-11-24"), today)).toBe("pending");
    expect(deriveState(row("pending", "2026-11-20", "2026-11-23"), today)).toBe("expired");
    expect(deriveState(row("approved", "2026-11-25", "2026-11-26"), today)).toBe("scheduled");
    expect(deriveState(row("approved", "2026-11-24", "2026-11-26"), today)).toBe("onloan");
    expect(deriveState(row("approved", "2026-11-20", "2026-11-23"), today)).toBe("overdue");
    expect(deriveState(row("returned", "2026-11-20", "2026-11-23"), today)).toBe("returned");
    expect(deriveState(row("declined", "2026-11-25", "2026-11-26"), today)).toBe("declined");
  });

  it("formats days and due labels", () => {
    expect(formatDay("2026-11-25")).toBe("Wed 25 Nov");
    expect(rangeDays("2026-11-25", "2026-11-26")).toBe(2);
    expect(dueLabel("2026-11-24", today)).toBe("Due today");
    expect(dueLabel("2026-11-26", today)).toBe("Due in 2 days");
    expect(dueLabel("2026-11-21", today)).toBe("Overdue by 3 days");
  });

  it("orders needs-action first, then loans by due date, then history", () => {
    const rows = [
      { ...row("returned", "2026-11-01", "2026-11-02"), createdAt: 1, updatedAt: 5 },
      { ...row("approved", "2026-11-20", "2026-11-30"), createdAt: 2 },
      { ...row("pending", "2026-11-25", "2026-11-26"), createdAt: 3 },
      { ...row("approved", "2026-11-20", "2026-11-22"), createdAt: 4 },
      { ...row("pending", "2026-11-01", "2026-11-02"), createdAt: 6, updatedAt: 6 },
    ];
    expect(sortRequests(rows, today).map((r) => r.createdAt)).toEqual([3, 4, 2, 6, 1]);
  });
});
