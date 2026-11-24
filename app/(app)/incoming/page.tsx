"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import { EmptyState, Loading, PageHeader } from "@/components/ui";

export default function IncomingRequestsPage() {
  const rows = useQuery(api.requests.incoming);
  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  const rest = rows?.filter((r) => r.status !== "pending") ?? [];
  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Requests to borrow your tools." />
      {rows === undefined ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No incoming requests">When a neighbour asks to borrow one of your tools, it shows up here.</EmptyState>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Waiting for you</h2>
              <ul className="space-y-3">
                {pending.map((row) => (
                  <li key={row._id}>
                    <RequestCard row={row} perspective="owner" />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Loans and history</h2>
              <ul className="space-y-3">
                {rest.map((row) => (
                  <li key={row._id}>
                    <RequestCard row={row} perspective="owner" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
