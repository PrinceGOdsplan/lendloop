"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { todayUtc } from "@/convex/lib/rules";
import { errorMessage } from "@/lib/format";
import { Button, ErrorText } from "./ui";

export function BorrowForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: (sent: boolean) => void }) {
  const create = useMutation(api.requests.create);
  const today = todayUtc();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ toolId, startDate, endDate });
      onDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="mt-3 space-y-3 rounded-lg bg-stone-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`from-${toolId}`}>From</label>
          <input id={`from-${toolId}`} type="date" required min={today} value={startDate} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`to-${toolId}`}>To</label>
          <input id={`to-${toolId}`} type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}
