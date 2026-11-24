"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import { EmptyState, Loading, PageHeader } from "@/components/ui";

export default function MyRequestsPage() {
  const rows = useQuery(api.requests.mine);
  return (
    <>
      <PageHeader title="My requests" subtitle="Tools you’ve asked to borrow." />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No requests yet">Find something under “All tools” and request it.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row._id}>
              <RequestCard row={row} perspective="borrower" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
