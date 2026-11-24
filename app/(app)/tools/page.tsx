"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BorrowForm } from "@/components/BorrowForm";
import { Button, Card, EmptyState, ErrorText, Loading, PageHeader, Pill, TrustedBadge } from "@/components/ui";
import { CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS, errorMessage, formatDate, type Category } from "@/lib/format";

export default function AllToolsPage() {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.listAll, category ? { category } : {});
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);
  const [borrowing, setBorrowing] = useState<Id<"tools"> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function adminRemove(toolId: Id<"tools">, name: string) {
    if (!confirm(`Remove “${name}” from LendLoop? Pending requests will be declined.`)) return;
    setError(null);
    try {
      await remove({ toolId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="All tools" subtitle="Everything your neighbours are lending.">
        <div className="w-48">
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <select id="category-filter" value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </PageHeader>

      {notice && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}
      <ErrorText message={error} />

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title={category ? "Nothing in this category yet" : "No tools listed yet"}>
          List something from “My listings”.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{tool.name}</h2>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                    </p>
                  </div>
                  {tool.available ? <Pill tone="green">Available</Pill> : <Pill tone="amber">On loan</Pill>}
                </div>
                <p className="mt-2 text-sm text-stone-700">{tool.description}</p>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  {tool.isMine ? "Your listing" : <>Lent by {tool.ownerName}</>}
                  {tool.ownerTrusted && <TrustedBadge />}
                </p>
                {tool.bookedRanges.length > 0 && (
                  <p className="mt-1 text-xs text-stone-500">
                    Booked: {tool.bookedRanges.map((r) => `${formatDate(r.startDate)}–${formatDate(r.endDate)}`).join(", ")}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  {!tool.isMine && borrowing !== tool._id && (
                    <Button variant="secondary" onClick={() => { setNotice(null); setBorrowing(tool._id); }}>
                      Request to borrow
                    </Button>
                  )}
                  {me?.role === "admin" && (
                    <Button variant="danger" onClick={() => adminRemove(tool._id, tool.name)}>
                      Remove listing
                    </Button>
                  )}
                </div>
                {borrowing === tool._id && (
                  <BorrowForm
                    toolId={tool._id}
                    onDone={(sent) => {
                      setBorrowing(null);
                      if (sent) setNotice(`Request sent for “${tool.name}”. Track it under My requests.`);
                    }}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
