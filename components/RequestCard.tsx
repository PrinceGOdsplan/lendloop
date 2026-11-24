"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage, formatDate, timeAgo } from "@/lib/format";
import { Button, Card, ErrorText, Pill, TrustedBadge } from "./ui";

export type RequestRow = {
  _id: Id<"requests">;
  status: "pending" | "approved" | "declined" | "returned";
  startDate: string;
  endDate: string;
  createdAt: number;
  overdue: boolean;
  toolName: string;
  toolRemoved: boolean;
  borrowerName?: string;
  ownerName?: string;
  ownerTrusted?: boolean;
  activity: { type: string; message: string; createdAt: number }[];
};

const statusTone = {
  pending: "amber",
  approved: "green",
  declined: "stone",
  returned: "blue",
} as const;

export function StatusPill({ status, overdue }: { status: RequestRow["status"]; overdue?: boolean }) {
  if (overdue) return <Pill tone="red">Overdue</Pill>;
  const label = status === "approved" ? "On loan" : status[0].toUpperCase() + status.slice(1);
  return <Pill tone={statusTone[status]}>{label}</Pill>;
}

const ACTIVITY_ICON: Record<string, string> = {
  notification_failed: "⚠",
  notification_skipped: "ⓘ",
};

export function Activity({ items }: { items: RequestRow["activity"] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
      {items.map((a, i) => (
        <li key={i} className={a.type === "notification_failed" ? "text-red-700" : undefined}>
          <span aria-hidden>{ACTIVITY_ICON[a.type] ?? "⚙"}</span> {a.message} ·{" "}
          <time dateTime={new Date(a.createdAt).toISOString()}>{timeAgo(a.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}

/**
 * One request/loan. `perspective` decides which actions are offered; Convex
 * independently checks the caller is allowed to take them.
 */
export function RequestCard({
  row,
  perspective,
}: {
  row: RequestRow;
  perspective: "borrower" | "owner" | "admin";
}) {
  const decide = useMutation(api.requests.decide);
  const markReturned = useMutation(api.requests.markReturned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {row.toolName}
            {row.toolRemoved && <span className="ml-2 text-xs text-stone-500">(listing removed)</span>}
          </p>
          <p className="mt-0.5 text-sm text-stone-600">
            {formatDate(row.startDate)} – {formatDate(row.endDate)}
            {perspective !== "borrower" && row.borrowerName && <> · borrower {row.borrowerName}</>}
            {perspective !== "owner" && row.ownerName && <> · from {row.ownerName}</>}
            {perspective !== "owner" && row.ownerTrusted && (
              <span className="ml-2">
                <TrustedBadge />
              </span>
            )}
          </p>
        </div>
        <StatusPill status={row.status} overdue={row.overdue} />
      </div>

      {perspective !== "admin" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {perspective === "owner" && row.status === "pending" && (
            <>
              <Button disabled={busy} onClick={() => run(() => decide({ requestId: row._id, decision: "approved" }))}>
                Approve
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => decide({ requestId: row._id, decision: "declined" }))}
              >
                Decline
              </Button>
            </>
          )}
          {row.status === "approved" && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => markReturned({ requestId: row._id }))}>
              Mark returned
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        <ErrorText message={error} />
      </div>
      <Activity items={row.activity} />
    </Card>
  );
}
