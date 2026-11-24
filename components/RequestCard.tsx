"use client";

import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { deriveState, dueLabel, errorMessage, formatDate, formatDay, rangeDays, timeAgo } from "@/lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusTimeline } from "./StatusTimeline";
import { useToast } from "./Toaster";
import { Button, Card, ErrorText, Pill, TrustedBadge, type Tone } from "./ui";

export type RequestRow = {
  _id: Id<"requests">;
  toolId?: Id<"tools">;
  toolCategory?: string;
  status: "pending" | "approved" | "declined" | "returned";
  startDate: string;
  endDate: string;
  createdAt: number;
  updatedAt?: number;
  decidedAt?: number;
  returnedAt?: number;
  overdue: boolean;
  toolName: string;
  toolRemoved: boolean;
  borrowerName?: string;
  ownerName?: string;
  ownerTrusted?: boolean;
  activity: { type: string; message: string; createdAt: number }[];
};

type Perspective = "borrower" | "owner" | "admin";

/** One status language: dot + label + tone, so state never relies on colour alone. */
export function statusLabel(
  row: Pick<RequestRow, "status" | "startDate" | "endDate">,
  perspective: Perspective,
  today?: string,
): { label: string; tone: Tone } {
  switch (deriveState(row, today)) {
    case "pending":
      return {
        label: perspective === "owner" ? "Needs you" : perspective === "borrower" ? "Waiting for owner" : "Pending",
        tone: "amber",
      };
    case "expired":
      return { label: "Expired", tone: "stone" };
    case "scheduled":
      return { label: `Approved · starts ${formatDate(row.startDate)}`, tone: "outline" };
    case "onloan":
      return { label: `On loan · due ${formatDate(row.endDate)}`, tone: "green" };
    case "overdue":
      return { label: dueLabel(row.endDate, today), tone: "red" };
    case "returned":
      return { label: "Returned", tone: "blue" };
    default:
      return { label: "Declined", tone: "stone" };
  }
}

export function StatusPill({
  row,
  perspective,
}: {
  row: Pick<RequestRow, "status" | "startDate" | "endDate">;
  perspective: Perspective;
}) {
  const { label, tone } = statusLabel(row, perspective);
  return (
    <Pill tone={tone}>
      <span aria-hidden>●</span> {label}
    </Pill>
  );
}

/**
 * Notification results. Skipped notifications (no n8n on this deployment) collapse
 * into one note; identical lines (e.g. retries) collapse with a count. Works the
 * same once n8n is live and the lines read "Owner notified ...".
 */
export function Activity({ items }: { items: RequestRow["activity"] }) {
  if (items.length === 0) return null;
  const skipped = items.some((a) => a.type === "notification_skipped");
  const failed = items.filter((a) => a.type === "notification_failed");
  const rest = items.filter((a) => a.type !== "notification_skipped" && a.type !== "notification_failed");
  const grouped = new Map<string, { message: string; createdAt: number; count: number; type: string }>();
  for (const a of rest) {
    const g = grouped.get(a.message);
    if (g) {
      g.count += 1;
      g.createdAt = Math.max(g.createdAt, a.createdAt);
    } else grouped.set(a.message, { ...a, count: 1 });
  }
  const lines = [...grouped.values()].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px] text-muted">
      {failed.map((a, i) => (
        <p key={i} className="text-overdue">
          <span aria-hidden>⚠</span> {a.message} ·{" "}
          <time dateTime={new Date(a.createdAt).toISOString()}>{timeAgo(a.createdAt)}</time>
        </p>
      ))}
      {skipped && (
        <p>
          <span aria-hidden>ⓘ</span> Email alerts are off on this demo. Status updates show here.
        </p>
      )}
      {lines.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-ink-2">Show activity ({lines.length})</summary>
          <ul className="mt-2 space-y-1">
            {lines.map((a) => (
              <li key={a.message}>
                <span aria-hidden>⚙</span> {a.message}
                {a.count > 1 && <> (×{a.count})</>} ·{" "}
                <time dateTime={new Date(a.createdAt).toISOString()}>{timeAgo(a.createdAt)}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

type Status = RequestRow["status"];

function patchStatus(store: OptimisticLocalStore, requestId: Id<"requests">, status: Status) {
  const patch = (rows: RequestRow[] | undefined) => rows?.map((r) => (r._id === requestId ? { ...r, status } : r));
  const incoming = store.getQuery(api.requests.incoming, {});
  if (incoming) store.setQuery(api.requests.incoming, {}, patch(incoming as RequestRow[]) as typeof incoming);
  const mine = store.getQuery(api.requests.mine, {});
  if (mine) store.setQuery(api.requests.mine, {}, patch(mine as RequestRow[]) as typeof mine);
}

const initials = (name?: string) =>
  (name ?? "?")
    .split(/\s+/)
    .filter((w) => /\w/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * One request/loan. `perspective` decides which actions are offered; Convex
 * independently checks the caller is allowed to take them.
 */
export function RequestCard({ row, perspective }: { row: RequestRow; perspective: Perspective }) {
  const decide = useMutation(api.requests.decide).withOptimisticUpdate((store, { requestId, decision }) =>
    patchStatus(store, requestId, decision),
  );
  const markReturned = useMutation(api.requests.markReturned).withOptimisticUpdate((store, { requestId }) =>
    patchStatus(store, requestId, "returned"),
  );
  const toast = useToast();
  const [busy, setBusy] = useState<"approve" | "decline" | "return" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = deriveState(row);
  const dates = `${formatDate(row.startDate)} to ${formatDate(row.endDate)}`;
  const days = rangeDays(row.startDate, row.endDate);

  async function run(kind: "approve" | "decline" | "return", fn: () => Promise<unknown>, done: string) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      toast(done);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold">
            {row.toolName}
            {row.toolRemoved && <span className="ml-2 text-xs font-normal text-muted">(listing removed)</span>}
          </h3>
          <p className="mt-1 text-[13px] text-muted">
            {formatDay(row.startDate)} to {formatDay(row.endDate)} · {days} day{days === 1 ? "" : "s"}
            {perspective === "admin" && row.borrowerName && (
              <>
                {" "}
                · {row.borrowerName} → {row.ownerName}
              </>
            )}
            {perspective === "borrower" && row.ownerName && <> · from {row.ownerName}</>}
            {perspective === "borrower" && row.ownerTrusted && (
              <span className="ml-2 align-middle">
                <TrustedBadge />
              </span>
            )}
          </p>
        </div>
        <StatusPill row={row} perspective={perspective} />
      </div>

      {perspective === "owner" && row.borrowerName && (
        <div className="mt-4 flex items-center gap-3 rounded-control border border-line bg-canvas p-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-200 text-[13px] font-semibold"
          >
            {initials(row.borrowerName)}
          </span>
          <p className="text-sm">
            <strong>{row.borrowerName}</strong> {state === "pending" ? "wants to borrow it" : "borrower"}
            <span className="block text-[13px] text-muted">Asked {timeAgo(row.createdAt)}</span>
          </p>
        </div>
      )}

      <StatusTimeline row={row} perspective={perspective} />

      {perspective !== "admin" && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 empty:hidden sm:flex sm:flex-wrap">
          {perspective === "owner" && state === "pending" && (
            <>
              <Button
                disabled={busy !== null}
                aria-busy={busy === "approve"}
                onClick={() =>
                  run(
                    "approve",
                    () => decide({ requestId: row._id, decision: "approved" }),
                    `Approved. ${row.toolName} is booked ${dates}.`,
                  )
                }
              >
                {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                aria-busy={busy === "decline"}
                onClick={() => setConfirming(true)}
              >
                {busy === "decline" ? "Declining…" : "Decline"}
              </Button>
            </>
          )}
          {row.status === "approved" && (
            <Button
              variant="secondary"
              disabled={busy !== null}
              aria-busy={busy === "return"}
              onClick={() => run("return", () => markReturned({ requestId: row._id }), "Marked returned.")}
            >
              {busy === "return" ? "Saving…" : "Mark returned"}
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        <ErrorText message={error} />
      </div>
      <Activity items={row.activity} />
      <ConfirmDialog
        open={confirming}
        title="Decline this request?"
        confirmLabel="Decline request"
        cancelLabel="Keep it"
        onClose={() => setConfirming(false)}
        onConfirm={() => run("decline", () => decide({ requestId: row._id, decision: "declined" }), "Declined.")}
      >
        {row.borrowerName ?? "The borrower"} asked for {dates}. You can’t undo this.
      </ConfirmDialog>
    </Card>
  );
}
