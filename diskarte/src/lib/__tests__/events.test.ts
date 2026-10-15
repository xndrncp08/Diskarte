import { describe, expect, it } from "vitest";
import { activeEvents, eventCalendar, eventStatus, weeklyEventDates, type ServerEvent } from "@/lib/events";

const now = Date.parse("2026-10-13T12:00:00Z");

describe("events", () => {
  it("creates bounded weekly occurrences and rejects invalid series", () => {
    const starts = new Date(2026, 9, 25, 18, 30), ends = new Date(2026, 9, 25, 19, 30);
    const dates = weeklyEventDates(starts, ends, 4);
    expect(dates).toHaveLength(4);
    expect(dates[0]).toEqual({ starts_at: starts.toISOString(), ends_at: ends.toISOString() });
    dates.forEach((date, index) => { const start = new Date(date.starts_at); expect(start.getHours()).toBe(18); expect(start.getDay()).toBe(starts.getDay()); expect(start.getDate()).toBe(new Date(2026, 9, 25 + index * 7).getDate()); });
    expect(weeklyEventDates(starts, null, 1)[0].ends_at).toBeNull();
    expect(() => weeklyEventDates(starts, ends, 1000)).toThrow();
    expect(() => weeklyEventDates(starts, new Date(starts.getTime() - 1), 4)).toThrow();
  });
  it("knows upcoming, live and ended (open-ended ones last 4 hours)", () => {
    expect(eventStatus({ starts_at: "2026-10-13T13:00:00Z", ends_at: null }, now)).toBe("upcoming");
    expect(eventStatus({ starts_at: "2026-10-13T11:00:00Z", ends_at: "2026-10-13T12:30:00Z" }, now)).toBe("live");
    expect(eventStatus({ starts_at: "2026-10-13T09:00:00Z", ends_at: null }, now)).toBe("live");
    expect(eventStatus({ starts_at: "2026-10-13T07:00:00Z", ends_at: null }, now)).toBe("ended");
    expect(eventStatus({ starts_at: "2026-10-13T10:00:00Z", ends_at: "2026-10-13T11:00:00Z" }, now)).toBe("ended");
  });

  it("lists what's not over, soonest first", () => {
    const later = { starts_at: "2026-10-14T00:00:00Z", ends_at: null };
    const live = { starts_at: "2026-10-13T11:00:00Z", ends_at: null };
    const over = { starts_at: "2026-10-12T00:00:00Z", ends_at: null };
    expect(activeEvents([later, over, live], now)).toEqual([live, later]);
  });

  it("exports UTC calendar dates with escaped text and UTF-8 safe line folding", () => {
    const event: ServerEvent = { id: "abc", name: "Study;一起🎉".repeat(15), description: "Bring, notes\\pens\r\nBEGIN:VALARM", server_id: "server", channel_id: null, location: "Manila, PH", created_by: null, created_at: "2026-10-14T00:00:00Z", starts_at: "2026-10-14T18:30:00+08:00", ends_at: "2026-10-14T19:30:00+08:00" };
    const calendar = eventCalendar(event, undefined, new Date("2026-10-14T00:00:00Z"));
    const unfolded = calendar.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART:20261014T103000Z\r\nDTEND:20261014T113000Z");
    expect(unfolded).toContain("SUMMARY:" + event.name.replace(/;/g, "\\;"));
    expect(unfolded).toContain("DESCRIPTION:Bring\\, notes\\\\pens\\nBEGIN:VALARM\r\n");
    expect(unfolded).toContain("LOCATION:Manila\\, PH\r\n");
    for (const line of calendar.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(calendar).not.toContain("\ufffd");
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(eventCalendar({ ...event, ends_at: null })).not.toContain("DTEND:");
  });
});
