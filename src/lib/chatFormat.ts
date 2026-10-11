// Pure formatting helpers shared by the user chat panel (ChatSupportButton.tsx) and the admin
// thread (AdminChatThread.tsx) — kept framework-free so they're trivially unit-testable (no test
// runner is configured in this repo yet, but these stay pure for when one is).

// "h:mm a" in the viewer's own local timezone — Intl does the locale/timezone work, this just
// pins the exact format (12-hour, no seconds, uppercase AM/PM) regardless of the viewer's locale.
export function formatMessageTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Today" / "Yesterday" / "12 Oct 2026" — compared against `now` (defaults to the actual current
// time; a caller can pass a fixed value for deterministic tests) in the viewer's local timezone,
// same as formatMessageTime.
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameDay(date, now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// True when `message` starts a new calendar day relative to the message immediately before it
// (or is simply the first message in the list) — the signal for rendering a day separator above
// it. `previousIso` is the previous message's created_at, or undefined for the very first message.
export function isNewDay(iso: string, previousIso: string | undefined): boolean {
  if (!previousIso) return true;
  return !isSameDay(new Date(iso), new Date(previousIso));
}
