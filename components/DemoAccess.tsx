"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Pill } from "./ui";

const accounts = [
  { label: "Neighbour", email: "demo-user+clerk_test@example.com" },
  { label: "Admin", email: "demo-admin+clerk_test@example.com" },
];

export function DemoAccess() {
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setError("");
      setCopied(email);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Couldn't copy. Select and copy the email address instead.");
    }
  }
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Reviewer demo</h2>
        <Pill tone="amber">Test mode</Pill>
      </div>
      <p className="mt-4 text-sm text-ink-2">
        Sign in with a test account. Use code <strong>424242</strong> when asked.
      </p>
      <div className="mt-4 space-y-2">
        {accounts.map((a) => (
          <div key={a.email} className="flex items-center justify-between gap-2 rounded-control border border-line p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.label}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted">{a.email}</p>
            </div>
            <Button size="sm" variant="secondary" aria-label={`Copy ${a.label} email`} onClick={() => copy(a.email)}>
              {copied === a.email ? "Copied" : "Copy"}
            </Button>
          </div>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "Email address copied" : ""}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-overdue">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Owners approve requests on their own tools. Admins mark Trusted Lenders and see every loan.
      </p>
    </Card>
  );
}
