import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800",
  secondary: "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-stone-600 hover:bg-stone-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "stone",
}: {
  children: ReactNode;
  tone?: "stone" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    stone: "bg-stone-100 text-stone-700",
    green: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    blue: "bg-sky-50 text-sky-800 ring-sky-600/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-stone-200 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function TrustedBadge() {
  return (
    <span title="Marked as a Trusted Lender by an admin">
      <Pill tone="blue">★ Trusted Lender</Pill>
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
      <p className="font-medium text-stone-800">{title}</p>
      {children && <div className="mt-1 text-sm text-stone-600">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-stone-500">Loading…</p>;
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  );
}
