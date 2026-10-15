import type { MessageWithAuthor } from "@/lib/messages";

const GROUP_WINDOW_MS = 7 * 60 * 1000;

/** Discord-style grouping: consecutive messages by the same author within 7 minutes collapse. */
export function isGroupedWithPrevious(prev: MessageWithAuthor | undefined, current: MessageWithAuthor): boolean {
  if (!prev || !prev.author_id || prev.author_id !== current.author_id) return false;
  if (current.reply_to_id) return false;
  const gap = new Date(current.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap >= 0 && gap < GROUP_WINDOW_MS && sameDay(prev.created_at, current.created_at);
}

/** Same calendar day in Philippine time (stable between server and client renders). */
export function sameDay(a: string, b: string) {
  return dayKey(new Date(a), SERVER_TIME_ZONE) === dayKey(new Date(b), SERVER_TIME_ZONE);
}

/**
 * Server renders (and the hydration pass) use a fixed Philippine timezone so markup is deterministic;
 * after hydration the browser's own timezone takes over (timeZone = undefined).
 */
export const SERVER_TIME_ZONE = "Asia/Manila";

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(kind: "time" | "day" | "parts", timeZone?: string, hour24 = false, language = "en") {
  const key = `${kind}:${timeZone ?? "local"}:${hour24}:${language}`;
  let f = formatters.get(key);
  if (!f) {
    f =
      kind === "time"
        ? new Intl.DateTimeFormat(language === "fil" ? "fil-PH" : "en-PH", { hour: hour24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: hour24 ? "h23" : "h12", timeZone })
        : kind === "day"
          ? new Intl.DateTimeFormat(language === "fil" ? "fil-PH" : "en-PH", { month: "long", day: "numeric", year: "numeric", timeZone })
          : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone });
    formatters.set(key, f);
  }
  return f;
}

/** Calendar-day key (YYYY-MM-DD) in the given timezone. */
function dayKey(date: Date, timeZone?: string) {
  return fmt("parts", timeZone).format(date);
}

export function formatTime(iso: string, timeZone?: string, hour24 = false, language = "en") {
  return fmt("time", timeZone, hour24, language).format(new Date(iso));
}

/** "Today 3:14 PM", "Yesterday 9:02 AM", or a full date. */
export function formatTimestamp(iso: string, now = new Date(), timeZone?: string, hour24 = false, language = "en") {
  const date = new Date(iso);
  const [year, month, day] = dayKey(now, timeZone).split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  const key = dayKey(date, timeZone);
  if (key === dayKey(now, timeZone)) return `${language === "fil" ? "Ngayon" : "Today"} ${formatTime(iso, timeZone, hour24, language)}`;
  if (key === yesterday) return `${language === "fil" ? "Kahapon" : "Yesterday"} ${formatTime(iso, timeZone, hour24, language)}`;
  return `${fmt("day", timeZone, hour24, language).format(date)} ${formatTime(iso, timeZone, hour24, language)}`;
}

export function formatDayDivider(iso: string, timeZone?: string, language = "en") {
  return fmt("day", timeZone, false, language).format(new Date(iso));
}
