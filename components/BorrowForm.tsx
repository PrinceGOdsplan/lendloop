"use client";

import { useMutation } from "convex/react";
import { useId, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIMITS, rangesOverlap, todayUtc, validateBorrowRange, type DateRange } from "@/convex/lib/rules";
import { errorMessage, formatDate, formatDay, rangeDays } from "@/lib/format";
import { Button, ErrorText } from "./ui";

const DAY = 86_400_000;

export function BorrowForm({
  toolId,
  bookedRanges = [],
  onDone,
}: {
  toolId: Id<"tools">;
  bookedRanges?: DateRange[];
  onDone: (sent: boolean) => void;
}) {
  const create = useMutation(api.requests.create);
  const uid = useId();
  const today = todayUtc();
  const [startDate, setStart] = useState(() => todayUtc(Date.now() + DAY));
  const [endDate, setEnd] = useState(() => todayUtc(Date.now() + 2 * DAY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side hints only. Convex re-checks every rule on submit.
  const range = { startDate, endDate };
  const clash = startDate && endDate ? bookedRanges.find((b) => rangesOverlap(b, range)) : undefined;
  const invalid = startDate && endDate ? validateBorrowRange(range, today) : "Pick both dates";
  const hint = clash
    ? `Those dates clash with a booked loan, ${formatDate(clash.startDate)} to ${formatDate(clash.endDate)}.`
    : invalid;
  const days = !invalid ? rangeDays(startDate, endDate) : null;
  const errorId = `${uid}-error`;

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (hint) return;
    setBusy(true);
    setError(null);
    try {
      await create({ toolId, startDate, endDate });
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="mt-4 space-y-3 rounded-control border border-line bg-canvas p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${uid}-start`}>Start</label>
          <input
            id={`${uid}-start`}
            type="date"
            required
            min={today}
            value={startDate}
            aria-describedby={`${uid}-help ${errorId}`}
            aria-invalid={!!hint}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > endDate) setEnd(e.target.value);
            }}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-end`}>Return by</label>
          <input
            id={`${uid}-end`}
            type="date"
            required
            min={startDate}
            value={endDate}
            aria-describedby={`${uid}-help ${errorId}`}
            aria-invalid={!!hint}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <p id={`${uid}-help`} className="text-[13px] text-muted">
        {days !== null ? `${days} day${days === 1 ? "" : "s"} · back by ${formatDay(endDate)}. ` : ""}
        Up to {LIMITS.maxLoanDays} days. Dates are calendar days (UTC).
      </p>
      {hint && (
        <p className="text-sm text-overdue" role="alert">
          {hint}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:flex">
        <Button type="submit" disabled={busy || !!hint} aria-busy={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
      <ErrorText id={errorId} message={error} />
    </form>
  );
}
