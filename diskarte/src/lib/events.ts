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

/** RFC 5545: UTC dates, escaped text and CRLF lines folded at 75 UTF-8 octets. */
export function eventCalendar(event: ServerEvent, location = event.location ?? "", now = new Date()) {
  const date = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = (value: string) => value.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Diskarte//Community Events//EN", "BEGIN:VEVENT",
    `UID:${text(event.id)}@diskarte`, `DTSTAMP:${date(now)}`, `DTSTART:${date(event.starts_at)}`,
    ...(event.ends_at ? [`DTEND:${date(event.ends_at)}`] : []),
    `SUMMARY:${text(event.name)}`, `DESCRIPTION:${text(event.description)}`, `LOCATION:${text(location)}`,
    "END:VEVENT", "END:VCALENDAR"];
  const encoder = new TextEncoder();
  return lines.map((line) => {
    let folded = "", bytes = 0;
    for (const char of line) {
      const size = encoder.encode(char).length;
      if (bytes + size > 75) { folded += "\r\n "; bytes = 1; }
      folded += char; bytes += size;
    }
    return folded;
  }).join("\r\n") + "\r\n";
}

export function downloadEventCalendar(event: ServerEvent, location?: string) {
  const url = URL.createObjectURL(new Blob([eventCalendar(event, location)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `diskarte-event-${event.id}.ics`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Finite weekly occurrences preserve device-local wall time through daylight-saving changes. */
export function weeklyEventDates(starts: Date, ends: Date | null, count: number) {
  if (![1, 4, 8, 12].includes(count) || !Number.isFinite(starts.getTime()) || ends && (!Number.isFinite(ends.getTime()) || ends <= starts)) throw new Error("Invalid event dates");
  return Array.from({ length: count }, (_, week) => {
    const start = new Date(starts); start.setDate(start.getDate() + week * 7);
    const end = ends ? new Date(ends) : null; if (end) end.setDate(end.getDate() + week * 7);
    if (end && end <= start) throw new Error("A recurring event ends before its start across a time change");
    return { starts_at: start.toISOString(), ends_at: end?.toISOString() ?? null };
  });
}
