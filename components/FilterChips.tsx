"use client";

export type Chip<K extends string> = { key: K; label: string; count?: number };

/** Toggle buttons with aria-pressed. Scrolls sideways on narrow screens. */
export function FilterChips<K extends string>({
  chips,
  value,
  onChange,
  label,
}: {
  chips: Chip<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="-mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {chips.map((c) => {
        const on = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.key)}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition motion-reduce:transition-none ${
              on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-field"
            }`}
          >
            {c.label}
            {c.count !== undefined && (
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${on ? "bg-white/20" : "bg-stone-100 text-muted"}`}
              >
                {c.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
