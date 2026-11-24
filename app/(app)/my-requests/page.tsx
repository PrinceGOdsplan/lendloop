"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestList } from "@/components/RequestList";

export default function MyRequestsPage() {
  const rows = useQuery(api.requests.mine);
  return (
    <RequestList
      rows={rows}
      perspective="borrower"
      title="My requests"
      subtitle="Tools you asked to borrow, from request to return."
      labels={{ all: "All", pending: "Pending", active: "On loan", history: "History" }}
      initial="all"
      empty={{ title: "No requests yet", body: "Find something under “Tools” and request it." }}
    />
  );
}
