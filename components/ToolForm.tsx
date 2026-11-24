"use client";

import { useId, useState, type FormEvent } from "react";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS, type Category, type Condition } from "@/lib/format";
import { LIMITS } from "@/convex/lib/rules";
import { Button, ErrorText } from "./ui";
import { errorMessage } from "@/lib/format";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

export function ToolForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  submitLabel: string;
  onSubmit: (input: ToolInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ToolInput>(
    initial ?? { name: "", category: "power_tools", condition: "good", description: "" },
  );
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form);
      if (!initial) setForm({ name: "", category: form.category, condition: "good", description: "" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-name`}>Name</label>
        <input
          id={`${uid}-name`}
          aria-describedby={error ? `${uid}-error` : undefined}
          required
          maxLength={LIMITS.nameMax}
          placeholder="e.g. Cordless drill"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-category`}>Category</label>
        <select
          id={`${uid}-category`}
          aria-describedby={error ? `${uid}-error` : undefined}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-condition`}>Condition</label>
        <select
          id={`${uid}-condition`}
          aria-describedby={error ? `${uid}-error` : undefined}
          value={form.condition}
          onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-description`}>Short description</label>
        <textarea
          id={`${uid}-description`}
          aria-describedby={error ? `${uid}-error` : undefined}
          required
          rows={2}
          maxLength={LIMITS.descriptionMax}
          placeholder="What it is, what's included, any quirks"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <ErrorText id={`${uid}-error`} message={error} />
      </div>
    </form>
  );
}
