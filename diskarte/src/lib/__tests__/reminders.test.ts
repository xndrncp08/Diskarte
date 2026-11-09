import { describe, expect, it } from "vitest";
import { REMINDER_OPTIONS } from "@/lib/reminders";

describe("reminder options", () => {
  it("schedules relative times and tomorrow morning in local time", () => {
    const now = new Date(2026, 10, 8, 22, 30);
    const at = Object.fromEntries(REMINDER_OPTIONS.map((o) => [o.id, o.at(now)]));
    expect(at["1h"].getTime() - now.getTime()).toBe(3600_000);
    expect([at.tomorrow.getDate(), at.tomorrow.getHours(), at.tomorrow.getMinutes()]).toEqual([9, 9, 0]);
    expect(at.week.getDate()).toBe(15);
  });
});
