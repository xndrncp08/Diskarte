import type { Tables } from "@/lib/supabase/database.types";

export type ServerEvent = Tables<"server_events">;

// shortcut: an event without an end time counts as over 4 hours after it starts; add an "End event" control if people need longer.
const OPEN_ENDED_MS = 4 * 60 * 60 * 1000;

export function eventStatus(event: Pick<ServerEvent, "starts_at" | "ends_at">, now = Date.now()): "upcoming" | "live" | "ended" {
  const start = Date.parse(event.starts_at);
  const end = event.ends_at ? Date.parse(event.ends_at) : start + OPEN_ENDED_MS;
  if (now >= end) return "ended";
  return now >= start ? "live" : "upcoming";
}

/** Not over yet, soonest first. */
export function activeEvents<T extends Pick<ServerEvent, "starts_at" | "ends_at">>(events: T[], now = Date.now()) {
  return events.filter((e) => eventStatus(e, now) !== "ended").sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/** `<input type="datetime-local">` value (local time, minutes) ⇄ ISO. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
