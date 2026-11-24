"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RequestList } from "@/components/RequestList";

export default function IncomingRequestsPage() {
  const rows = useQuery(api.requests.incoming);
  return (
    <RequestList
      rows={rows}
      perspective="owner"
      title="Incoming"
      subtitle="Requests on your tools. You decide."
      labels={{ pending: "Needs you", active: "On loan", history: "History" }}
      initial="pending"
      empty={{
        title: "No incoming requests",
        body: "When a neighbour asks to borrow one of your tools, it shows up here.",
      }}
    />
  );
}
