"use client";

import { useState } from "react";
import { bucketOf, sortRequests, type Bucket } from "@/lib/requestFilters";
import { FilterChips } from "./FilterChips";
import { RequestCard, type RequestRow } from "./RequestCard";
import { CardSkeleton, EmptyState, PageHeader } from "./ui";

type Key = "all" | Bucket;

export function RequestList({
  rows,
  perspective,
  title,
  subtitle,
  labels,
  initial,
  empty,
}: {
  rows: RequestRow[] | undefined;
  perspective: "borrower" | "owner";
  title: string;
  subtitle: string;
  labels: Partial<Record<Key, string>>;
  initial: Key;
  empty: { title: string; body: string };
}) {
  const [picked, setFilter] = useState<Key | null>(null);
  const sorted = rows ? sortRequests(rows) : undefined;
  const count = (k: Key) => (k === "all" ? (rows?.length ?? 0) : (rows?.filter((r) => bucketOf(r) === k).length ?? 0));
  const keys = Object.keys(labels) as Key[];
  // Until the user picks, open on the first tab that has something in it.
  const filter = picked ?? (count(initial) > 0 ? initial : (keys.find((k) => count(k) > 0) ?? initial));
  const shown = sorted?.filter((r) => filter === "all" || bucketOf(r) === filter);

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        {rows && rows.length > 0 && (
          <FilterChips
            label="Filter requests"
            value={filter}
            onChange={setFilter}
            chips={keys.map((k) => ({ key: k, label: labels[k]!, count: count(k) }))}
          />
        )}
      </PageHeader>
      {shown === undefined ? (
        <ul aria-busy="true" className="space-y-3.5">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <CardSkeleton />
            </li>
          ))}
        </ul>
      ) : rows!.length === 0 ? (
        <EmptyState title={empty.title}>{empty.body}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title={`Nothing under “${labels[filter]}”`}>Try another filter.</EmptyState>
      ) : (
        <ul className="space-y-3.5">
          {shown.map((row) => (
            <li key={row._id}>
              <RequestCard row={row} perspective={perspective} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
