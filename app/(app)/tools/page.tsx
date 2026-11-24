"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BorrowForm } from "@/components/BorrowForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FilterChips } from "@/components/FilterChips";
import { useToast } from "@/components/Toaster";
import { Button, Card, CardSkeleton, EmptyState, ErrorText, PageHeader, Pill, TrustedBadge } from "@/components/ui";
import { deriveState } from "@/lib/format";
import { CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS, errorMessage, formatDate, type Category } from "@/lib/format";

export default function AllToolsPage() {
  return (
    <>
      <Suspense fallback={<ToolsSkeleton />}>
        <AllTools />
      </Suspense>
    </>
  );
}

function ToolsSkeleton() {
  return (
    <ul aria-busy="true" className="grid gap-3.5 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i}>
          <CardSkeleton />
        </li>
      ))}
    </ul>
  );
}

function AllTools() {
  const params = useSearchParams();
  const router = useRouter();
  const fromUrl = params.get("category");
  const category = (CATEGORIES as readonly string[]).includes(fromUrl ?? "") ? (fromUrl as Category) : "";
  const setCategory = (c: Category | "") => router.replace(c ? `/tools?category=${c}` : "/tools", { scroll: false });
  const tools = useQuery(api.tools.listAll, category ? { category } : {});
  const me = useQuery(api.users.me);
  const mine = useQuery(api.requests.mine);
  const remove = useMutation(api.tools.remove);
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [borrowing, setBorrowing] = useState<Id<"tools"> | null>(null);
  const [removing, setRemoving] = useState<{ id: Id<"tools">; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adminRemove(toolId: Id<"tools">, name: string) {
    setError(null);
    try {
      await remove({ toolId });
      toast(`Removed ${name}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const q = search.trim().toLowerCase();
  const shown = tools?.filter((t) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  const myRequest = (toolId: Id<"tools">) =>
    mine?.find((r) => r.toolId === toolId && (deriveState(r) === "pending" || r.status === "approved"));

  return (
    <>
      <PageHeader title="All tools" subtitle="Everything your neighbours are lending." />
      <div className="mb-6 space-y-3">
        <div className="max-w-sm">
          <label htmlFor="tool-search" className="sr-only">
            Search tools
          </label>
          <input
            id="tool-search"
            type="search"
            placeholder="Search tools"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <FilterChips
          label="Category"
          value={category}
          onChange={setCategory}
          chips={[
            { key: "" as const, label: "All" },
            ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
          ]}
        />
      </div>
      <ErrorText message={error} />

      {shown === undefined ? (
        <ToolsSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          title={
            q
              ? `No tools match “${search.trim()}”`
              : category
                ? `Nothing in ${CATEGORY_LABELS[category]} yet`
                : "No tools listed yet"
          }
          action={
            <Link
              href="/my-listings"
              className="inline-flex h-10 items-center rounded-control bg-brand px-4 text-[15px] font-semibold text-white"
            >
              List a tool
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3.5 md:grid-cols-2">
          {shown.map((tool) => {
            const req = myRequest(tool._id);
            return (
              <li key={tool._id}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[17px] font-semibold">{tool.name}</h2>
                      <p className="mt-1 text-[13px] text-muted">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {tool.available ? (
                        <Pill tone="green">
                          <span aria-hidden>●</span> Available
                        </Pill>
                      ) : (
                        <Pill tone="amber">
                          <span aria-hidden>●</span> On loan
                        </Pill>
                      )}
                      {me?.role === "admin" && (
                        <details className="relative">
                          <summary
                            aria-label={`More actions for ${tool.name}`}
                            className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-control text-lg text-muted hover:bg-stone-100 [&::-webkit-details-marker]:hidden"
                          >
                            ⋯
                          </summary>
                          <div className="absolute right-0 z-10 mt-1 w-48 rounded-control border border-line bg-white p-1 shadow-card">
                            <button
                              type="button"
                              className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-overdue hover:bg-overdue-bg"
                              onClick={(e) => {
                                (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                                setRemoving({ id: tool._id, name: tool.name });
                              }}
                            >
                              Remove listing
                            </button>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{tool.description}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    {tool.isMine ? "Your listing" : <>Lent by {tool.ownerName}</>}
                    {tool.ownerTrusted && <TrustedBadge />}
                  </p>
                  {tool.bookedRanges.length > 0 && (
                    <ul aria-label="Booked dates" className="mt-2 flex flex-wrap gap-1.5">
                      {tool.bookedRanges.map((r) => (
                        <li key={r.startDate} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-ink-2">
                          Booked {formatDate(r.startDate)} to {formatDate(r.endDate)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {req ? (
                      <>
                        <Pill tone={req.status === "approved" ? "green" : "amber"}>
                          {req.status === "approved"
                            ? `Borrowing · due ${formatDate(req.endDate)}`
                            : `Requested · ${formatDate(req.startDate)} to ${formatDate(req.endDate)}`}
                        </Pill>
                        <Link
                          href="/my-requests"
                          className="text-sm font-semibold text-brand-ink underline underline-offset-4"
                        >
                          View
                        </Link>
                      </>
                    ) : (
                      !tool.isMine &&
                      borrowing !== tool._id && (
                        <Button variant="secondary" onClick={() => setBorrowing(tool._id)}>
                          Request to borrow
                        </Button>
                      )
                    )}
                  </div>
                  {borrowing === tool._id && (
                    <BorrowForm
                      toolId={tool._id}
                      bookedRanges={tool.bookedRanges}
                      onDone={(sent) => {
                        setBorrowing(null);
                        if (sent) toast("Request sent. Track it in My requests.");
                      }}
                    />
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? "listing"}?`}
        confirmLabel="Remove listing"
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && adminRemove(removing.id, removing.name)}
      >
        Pending requests on it will be declined.
      </ConfirmDialog>
    </>
  );
}
