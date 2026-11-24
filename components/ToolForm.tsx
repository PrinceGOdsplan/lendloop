"use client";

import { useState, type FormEvent } from "react";
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
        <label htmlFor="tool-name">Name</label>
        <input
          id="tool-name"
          required
          maxLength={LIMITS.nameMax}
          placeholder="e.g. Cordless drill"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="tool-category">Category</label>
        <select
          id="tool-category"
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
        <label htmlFor="tool-condition">Condition</label>
        <select
          id="tool-condition"
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
        <label htmlFor="tool-description">Short description</label>
        <textarea
          id="tool-description"
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
        <ErrorText message={error} />
      </div>
    </form>
  );
}
