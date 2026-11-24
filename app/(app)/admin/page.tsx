"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FilterChips } from "@/components/FilterChips";
import { Activity, StatusPill, type RequestRow } from "@/components/RequestCard";
import { StatusTimeline } from "@/components/StatusTimeline";
import { useToast } from "@/components/Toaster";
import {
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorText,
  Loading,
  PageHeader,
  Pill,
  Skeleton,
  TrustedBadge,
} from "@/components/ui";
import { deriveState, errorMessage, formatDate, timeAgo } from "@/lib/format";

/**
 * Admin oversight. Hiding the nav link is cosmetic: every query/mutation used here
 * calls requireAdmin() in Convex, so a normal user gets an error, not data.
 * Owners decide requests on their own tools; admins never approve.
 */
export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Loading />;
  if (me?.role !== "admin") {
    return <PageHeader title="Admins only" subtitle="Your account doesn’t have admin access." />;
  }
  return (
    <Suspense fallback={<Loading />}>
      <AdminContent />
    </Suspense>
  );
}

const FILTERS = ["all", "pending", "onloan", "overdue", "returned", "declined"] as const;
type Filter = (typeof FILTERS)[number];
const LABELS: Record<Filter, string> = {
  all: "All",
  pending: "Pending",
  onloan: "On loan",
  overdue: "Overdue",
  returned: "Returned",
  declined: "Declined",
};
const EMPTY: Record<Filter, string> = {
  all: "No requests yet. They show up here as soon as a neighbour asks to borrow something.",
  pending: "Nothing pending. New requests show up here.",
  onloan: "Nothing on loan. Loans appear here once an owner approves a request.",
  overdue: "Nothing overdue.",
  returned: "No returned loans yet.",
  declined: "Nothing declined or expired.",
};

function filterOf(row: RequestRow): Exclude<Filter, "all"> {
  const s = deriveState(row);
  if (s === "scheduled") return "onloan";
  if (s === "expired") return "declined";
  return s;
}

function AdminContent() {
  const overview = useQuery(api.admin.overview);
  const lenders = useQuery(api.admin.lenders);
  const audit = useQuery(api.admin.auditTrail);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const remove = useMutation(api.tools.remove);
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const status = (FILTERS as readonly string[]).includes(params.get("status") ?? "")
    ? (params.get("status") as Filter)
    : "all";
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<RequestRow | null>(null);
  const [removing, setRemoving] = useState<RequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = overview?.rows as RequestRow[] | undefined;
  const q = search.trim().toLowerCase();
  const matches = (r: RequestRow) =>
    !q || [r.toolName, r.borrowerName, r.ownerName].some((s) => s?.toLowerCase().includes(q));
  const shown = rows?.filter((r) => (status === "all" || filterOf(r) === status) && matches(r));
  const chipCount = (f: Filter) => rows?.filter((r) => f === "all" || filterOf(r) === f).length ?? 0;
  const counts = overview?.counts;
  const liveDetails = details && rows ? (rows.find((r) => r._id === details._id) ?? details) : details;

  async function act(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      toast(done);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Every request and loan across LendLoop. Owners decide on their own tools.">
        <Pill tone="green">
          <span aria-hidden>●</span> Role checked in Convex
        </Pill>
      </PageHeader>
      <ErrorText message={error} />

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(
          [
            ["Pending", counts?.pending, "text-pending"],
            ["On loan", counts?.onLoan, ""],
            ["Overdue", counts?.overdue, "text-overdue"],
            ["Returned", counts?.returned, ""],
            ["Listings", counts?.listings, ""],
          ] as const
        ).map(([label, value, tone]) => (
          <Card key={label} className="p-4 last:col-span-2 sm:last:col-span-1">
            <p className="text-[13px] text-muted">{label}</p>
            {value === undefined ? (
              <Skeleton className="mt-2 h-7 w-10" />
            ) : (
              <p className={`mt-1 text-[26px] font-semibold ${value > 0 ? tone : ""}`}>{value}</p>
            )}
          </Card>
        ))}
      </section>

      <Card className="mb-8 p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips
            label="Filter by status"
            value={status}
            onChange={(f) => router.replace(f === "all" ? pathname : `${pathname}?status=${f}`, { scroll: false })}
            chips={FILTERS.map((f) => ({ key: f, label: LABELS[f], count: rows ? chipCount(f) : undefined }))}
          />
          <div className="lg:w-64">
            <label htmlFor="admin-search" className="sr-only">
              Search tool or person
            </label>
            <input
              id="admin-search"
              type="search"
              placeholder="Search tool or person"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {shown === undefined ? (
          <div aria-busy="true" className="space-y-3 p-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-4">
            <EmptyState title={q ? `Nothing matches “${search.trim()}”` : EMPTY[status]} />
          </div>
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Tool
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Dates
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Borrower → Lender
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Updated
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r._id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-semibold">
                      {r.toolName}
                      {r.toolRemoved && <span className="ml-1 text-xs font-normal text-muted">(removed)</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDate(r.startDate)} to {formatDate(r.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      {r.borrowerName} → {r.ownerName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill row={r} perspective="admin" />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(r.updatedAt ?? r.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDetails(r)}
                        aria-label={`Details for ${r.toolName}`}
                      >
                        Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {shown.map((r) => (
                <li key={r._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.toolName}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {formatDate(r.startDate)} to {formatDate(r.endDate)} · {r.borrowerName} → {r.ownerName}
                      </p>
                    </div>
                    <StatusPill row={r} perspective="admin" />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[13px] text-muted">
                    Updated {timeAgo(r.updatedAt ?? r.createdAt)}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDetails(r)}
                      aria-label={`Details for ${r.toolName}`}
                    >
                      Details
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Lenders</h2>
          {lenders === undefined ? (
            <CardSkeleton />
          ) : lenders.length === 0 ? (
            <EmptyState title="No lenders yet" />
          ) : (
            <Card className="divide-y divide-line p-0">
              {lenders.map((l) => (
                <div key={l._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {l.name} {l.trustedLender && <TrustedBadge />}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {l.listings} listing{l.listings === 1 ? "" : "s"} · {l.onLoan} on loan
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={l.trustedLender ? "ghost" : "secondary"}
                    onClick={() =>
                      act(
                        () => setTrusted({ userId: l._id, trusted: !l.trustedLender }),
                        l.trustedLender
                          ? `${l.name} is no longer a Trusted Lender.`
                          : `${l.name} is now a Trusted Lender.`,
                      )
                    }
                  >
                    {l.trustedLender ? "Remove trust" : "☆ Mark trusted"}
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Admin audit trail</h2>
          <Card className="p-4">
            {audit === undefined ? (
              <Skeleton className="h-4 w-56" />
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted">
                No admin actions yet. Trust changes and removed listings are recorded here.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {audit.map((e) => (
                  <li key={e._id}>
                    <strong>{e.actorName}</strong>{" "}
                    {e.action === "trusted_set"
                      ? `marked ${e.targetName} as Trusted Lender`
                      : e.action === "trusted_unset"
                        ? `removed Trusted Lender from ${e.targetName}`
                        : `removed the listing ${e.toolName}`}
                    <span className="block text-[13px] text-muted">{timeAgo(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <DetailsDrawer
        row={liveDetails}
        onClose={() => setDetails(null)}
        onRemove={(r) => {
          setDetails(null);
          setRemoving(r);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.toolName ?? "listing"}?`}
        confirmLabel="Remove listing"
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const r = removing;
          if (r?.toolId) void act(() => remove({ toolId: r.toolId as Id<"tools"> }), `Removed ${r.toolName}.`);
        }}
      >
        Pending requests on it will be declined.
      </ConfirmDialog>
    </>
  );
}

function DetailsDrawer({
  row,
  onClose,
  onRemove,
}: {
  row: RequestRow | null;
  onClose: () => void;
  onRemove: (r: RequestRow) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) d.showModal();
    if (!row && d.open) d.close();
  }, [row]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="details-title"
      className="ml-auto mr-0 mt-0 h-dvh max-h-none w-full max-w-md overflow-y-auto border-l border-line bg-white p-6 text-ink shadow-xl"
    >
      {row && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="details-title" className="text-xl font-semibold tracking-tight">
                {row.toolName}
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                {formatDate(row.startDate)} to {formatDate(row.endDate)} · {row.borrowerName} → {row.ownerName}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close details">
              ✕
            </Button>
          </div>
          <div className="mt-4">
            <StatusPill row={row} perspective="admin" />
          </div>
          <StatusTimeline row={row} perspective="admin" />
          <Activity items={row.activity} />
          <p className="mt-6 text-[13px] text-muted">
            Only the owner can approve or decline. Admins can remove the listing.
          </p>
          {!row.toolRemoved && row.toolId && (
            <Button variant="danger" className="mt-3" onClick={() => onRemove(row)}>
              Remove listing
            </Button>
          )}
        </>
      )}
    </dialog>
  );
}
