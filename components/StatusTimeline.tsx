import Link from "next/link";
import { dueLabel, formatDay, deriveState, type StateRow } from "@/lib/format";

type Row = StateRow & {
  createdAt: number;
  decidedAt?: number;
  returnedAt?: number;
  ownerName?: string;
  toolCategory?: string;
};

type Step = {
  label: string;
  meta?: string;
  state: "done" | "current" | "future";
  tone?: "pending" | "onloan" | "overdue";
};

const stamp = (ms?: number) =>
  ms === undefined
    ? undefined
    : new Date(ms).toLocaleString("en-GB", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

const ringTone = {
  pending: "border-pending text-pending",
  onloan: "border-brand text-brand",
  overdue: "border-overdue text-overdue",
};

/** Where a request is, who acts next, and when it is due back. */
export function StatusTimeline({
  row,
  perspective,
  today,
}: {
  row: Row;
  perspective: "borrower" | "owner" | "admin";
  today?: string;
}) {
  const state = deriveState(row, today);

  if (state === "declined") {
    return (
      <p className="mt-4 text-sm text-ink-2">
        Declined{row.decidedAt ? ` ${stamp(row.decidedAt)}` : ""}.{" "}
        {perspective === "borrower" && (
          <Link
            href={row.toolCategory ? `/tools?category=${row.toolCategory}` : "/tools"}
            className="font-semibold text-brand-ink underline underline-offset-4"
          >
            Find a similar tool
          </Link>
        )}
      </p>
    );
  }
  if (state === "expired") {
    return <p className="mt-4 text-sm text-ink-2">Expired. The owner didn’t respond before the dates passed.</p>;
  }

  const waiting = perspective === "owner" ? "Needs you" : `Waiting on ${row.ownerName ?? "the owner"}`;
  const steps: Step[] =
    state === "pending"
      ? [
          { label: "Requested", meta: stamp(row.createdAt), state: "done" },
          { label: "Owner decides", meta: waiting, state: "current", tone: "pending" },
          { label: "On loan", meta: `From ${formatDay(row.startDate)}`, state: "future" },
          { label: "Returned", meta: `Due ${formatDay(row.endDate)}`, state: "future" },
        ]
      : [
          { label: "Requested", meta: stamp(row.createdAt), state: "done" },
          { label: "Approved", meta: stamp(row.decidedAt), state: "done" },
          state === "returned"
            ? { label: "On loan", meta: `${formatDay(row.startDate)} to ${formatDay(row.endDate)}`, state: "done" }
            : {
                label: "On loan",
                meta: state === "scheduled" ? `Starts ${formatDay(row.startDate)}` : dueLabel(row.endDate, today),
                state: "current",
                tone: state === "overdue" ? "overdue" : "onloan",
              },
          state === "returned"
            ? { label: "Returned", meta: stamp(row.returnedAt), state: "done" }
            : { label: "Returned", meta: `Due ${formatDay(row.endDate)}`, state: "future" },
        ];

  return (
    <ol aria-label="Request progress" className="mt-5 grid grid-cols-4">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0 pr-2">
          <div className="flex items-center">
            <span
              className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === "done"
                  ? "bg-brand text-white"
                  : s.state === "current"
                    ? `border-2 bg-white ${ringTone[s.tone ?? "pending"]}`
                    : "border-2 border-line bg-white"
              }`}
            >
              {s.state === "done" ? (
                <span aria-hidden>✓</span>
              ) : s.state === "current" ? (
                <span aria-hidden>●</span>
              ) : null}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`ml-2 h-0.5 flex-1 rounded ${s.state === "done" ? "bg-brand" : "bg-line"}`}
              />
            )}
          </div>
          <p className="mt-2 text-[12.5px] font-semibold sm:text-sm">
            {s.label}
            <span className="sr-only">
              {s.state === "done" ? ", done" : s.state === "current" ? ", current step" : ", not yet"}
            </span>
          </p>
          {s.meta && <p className="mt-0.5 text-xs text-muted sm:text-[13px]">{s.meta}</p>}
        </li>
      ))}
    </ol>
  );
}
