import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/chat-format";
import { DEFAULT_DISPLAY_PREFS, parseDisplayPrefs } from "@/lib/display-prefs";

describe("display prefs", () => {
  it("falls back to defaults for missing, unknown or broken values", () => {
    expect(parseDisplayPrefs(null)).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(parseDisplayPrefs("{nope")).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(parseDisplayPrefs(JSON.stringify({ fontSize: 99, spoilers: "sometimes", reducedMotion: "maybe" }))).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(parseDisplayPrefs(JSON.stringify({ fontSize: 18, spoilers: "always", inlineMedia: false, hour24: true, reducedMotion: "on" }))).toMatchObject({
      fontSize: 18,
      spoilers: "always",
      inlineMedia: false,
      hour24: true,
      reducedMotion: "on",
      reactions: true,
    });
  });

  it("formats 24-hour time when asked", () => {
    expect(formatTime("2026-09-26T13:05:00Z", "UTC")).toMatch(/^1:05\s?PM$/i);
    expect(formatTime("2026-09-26T13:05:00Z", "UTC", true)).toBe("13:05");
  });
});
