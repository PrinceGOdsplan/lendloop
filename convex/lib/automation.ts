/**
 * Pure helpers for automation dedupe keys and activity messages.
 * Convex builds the user-visible text itself; n8n only reports *what* happened,
 * so a compromised or buggy workflow cannot inject arbitrary text into the UI.
 */
import { isValidDate } from "./rules";

export const NOTIFY_EVENTS = ["created", "approved", "declined", "returned"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];
export type RecipientRole = "owner" | "borrower";

export function notificationKey(requestId: string, event: NotifyEvent): string {
  return `request:${requestId}:${event}`;
}

export function reminderKey(requestId: string, day: string): string {
  return `reminder:${requestId}:${day}`;
}

export function failureKey(requestId: string, event: NotifyEvent): string {
  return `${notificationKey(requestId, event)}:failed`;
}

/** Check that a dedupe key sent back by n8n belongs to this request and type. */
export function parseDedupeKey(
  key: string,
  requestId: string,
  type: "request_notification" | "overdue_reminder",
  today: string,
): { ok: true; event?: NotifyEvent; day?: string } | { ok: false; reason: string } {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[1] !== requestId) {
    return { ok: false, reason: "dedupeKey does not match requestId" };
  }
  if (type === "request_notification") {
    if (parts[0] !== "request" || !(NOTIFY_EVENTS as readonly string[]).includes(parts[2])) {
      return { ok: false, reason: "invalid notification dedupeKey" };
    }
    return { ok: true, event: parts[2] as NotifyEvent };
  }
  if (parts[0] !== "reminder" || !isValidDate(parts[2]) || parts[2] > today) {
    return { ok: false, reason: "invalid reminder dedupeKey" };
  }
  return { ok: true, day: parts[2] };
}

export function notificationMessage(event: NotifyEvent, recipient: RecipientRole): string {
  const who = recipient === "owner" ? "Owner" : "Borrower";
  switch (event) {
    case "created":
      return `${who} notified of new request`;
    case "approved":
      return `${who} notified: request approved`;
    case "declined":
      return `${who} notified: request declined`;
    case "returned":
      return `${who} notified: marked returned`;
  }
}

export const REMINDER_MESSAGE = "Overdue reminder sent to borrower";

/** Exponential backoff for webhook delivery: 30s, 60s, 120s, 240s (cap 10 min). */
export const MAX_DELIVERY_ATTEMPTS = 5;
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** (attempt - 1), 600_000);
}

/** Network errors, timeouts, 408, 429 and 5xx are worth retrying; other 4xx are not. */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
}
