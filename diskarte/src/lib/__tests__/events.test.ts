import { describe, expect, it } from "vitest";
import { activeEvents, eventStatus } from "@/lib/events";

const now = Date.parse("2026-10-13T12:00:00Z");

describe("events", () => {
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
});
