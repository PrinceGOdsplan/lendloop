import { ConvexError } from "convex/values";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  CONDITIONS,
  CONDITION_LABELS,
  type Category,
  type Condition,
} from "@/convex/lib/rules";

export { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS };
export type { Category, Condition };

export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "yesterday", "just now" */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86_400), "day");
}

export function formatDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
