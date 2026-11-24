import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "dangerSolid" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-ink",
  secondary: "border border-field/60 bg-white text-ink hover:bg-stone-100",
  danger: "border border-overdue-line bg-white text-overdue hover:bg-overdue-bg",
  dangerSolid: "bg-overdue text-white hover:bg-red-800",
  ghost: "text-ink-2 hover:bg-stone-100",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "sm" }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-control font-semibold transition motion-reduce:transition-none ${size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-[15px]"} disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface p-5 shadow-card ${className}`}>{children}</div>;
}

export type Tone = "stone" | "green" | "amber" | "red" | "blue" | "outline";

const tones: Record<Tone, string> = {
  stone: "border-declined-line bg-declined-bg text-declined",
  green: "border-onloan-line bg-onloan-bg text-onloan",
  outline: "border-onloan-line bg-white text-onloan",
  amber: "border-pending-line bg-pending-bg text-pending",
  red: "border-overdue-line bg-overdue-bg text-overdue",
  blue: "border-returned-line bg-returned-bg text-returned",
};

export function Pill({ children, tone = "stone" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function TrustedBadge() {
  return (
    <span title="Marked as a Trusted Lender by an admin">
      <Pill tone="blue">
        ★ Trusted Lender<span className="sr-only">: marked trusted by an admin</span>
      </Pill>
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-field/50 bg-white/70 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading content" className="space-y-3">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2].map((i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ErrorText({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-overdue">
      {message}
    </p>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-stone-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}
export function CardSkeleton() {
  return (
    <Card>
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-3 w-4/5 max-w-56" />
      <Skeleton className="mt-5 h-3 w-2/3" />
    </Card>
  );
}
