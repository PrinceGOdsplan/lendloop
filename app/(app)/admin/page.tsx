"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { RequestCard } from "@/components/RequestCard";
import { Button, Card, EmptyState, ErrorText, Loading, PageHeader, TrustedBadge } from "@/components/ui";
import { errorMessage } from "@/lib/format";

/**
 * Admin tools. Hiding the nav link is cosmetic: every query/mutation used here
 * calls requireAdmin() in Convex, so a normal user gets an error, not data.
 */
export default function AdminPage() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <Loading />;
  if (me?.role !== "admin") {
    return <EmptyState title="Admins only">You don’t have access to this page.</EmptyState>;
  }
  return <AdminContent />;
}

function AdminContent() {
  const loans = useQuery(api.requests.allLoans);
  const lenders = useQuery(api.admin.lenders);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Mark Trusted Lenders and review every loan. Remove any listing from “All tools”."
      />
      <ErrorText message={error} />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Lenders</h2>
        {lenders === undefined ? (
          <Loading />
        ) : lenders.length === 0 ? (
          <EmptyState title="No lenders yet" />
        ) : (
          <Card className="divide-y divide-stone-100 p-0">
            {lenders.map((l) => (
              <div key={l._id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-stone-500">
                    {l.listings} listing{l.listings === 1 ? "" : "s"}
                  </span>
                  {l.trustedLender && <TrustedBadge />}
                </div>
                <Button
                  variant={l.trustedLender ? "secondary" : "primary"}
                  onClick={async () => {
                    setError(null);
                    try {
                      await setTrusted({ userId: l._id, trusted: !l.trustedLender });
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                >
                  {l.trustedLender ? "Remove Trusted" : "Mark Trusted Lender"}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">All loans</h2>
        {loans === undefined ? (
          <Loading />
        ) : loans.length === 0 ? (
          <EmptyState title="No loans yet" />
        ) : (
          <ul className="space-y-3">
            {loans.map((row) => (
              <li key={row._id}>
                <RequestCard row={row} perspective="admin" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
