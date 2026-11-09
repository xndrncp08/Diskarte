import { describe, expect, it } from "vitest";
import { hangoutTimeLeft, isListedConversation, isLiveHangout, topicLabel } from "@/lib/hangouts";

const at = Date.parse("2026-11-08T12:00:00Z");
const plus = (ms: number) => new Date(at + ms).toISOString();

describe("hangouts", () => {
  it("formats the time left", () => {
    expect(hangoutTimeLeft(plus(2 * 3600_000 + 5 * 60_000 + 30_000), at)).toBe("2h 05m left");
    expect(hangoutTimeLeft(plus(12 * 60_000), at)).toBe("12m left");
    expect(hangoutTimeLeft(plus(30_000), at)).toBe("Ending");
    expect(hangoutTimeLeft(plus(-1), at)).toBe("Ended");
  });

  it("lists kept and live hangouts but not ended ones", () => {
    expect(isLiveHangout(plus(1000), at)).toBe(true);
    expect(isLiveHangout(null, at)).toBe(false);
    expect(isListedConversation({ hangoutUntil: null }, at)).toBe(true);
    expect(isListedConversation({ hangoutUntil: plus(1000) }, at)).toBe(true);
    expect(isListedConversation({ hangoutUntil: plus(-1000) }, at)).toBe(false);
  });

  it("labels unknown topics as a plain hangout", () => {
    expect(topicLabel("study")).toBe("Study");
    expect(topicLabel(null)).toBe("Hangout");
  });
});
