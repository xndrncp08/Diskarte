import { describe, expect, it } from "vitest";
import { formatTimestamp } from "@/lib/chat-format";
import { parseDisplayPrefs, validTimeZone } from "@/lib/display-prefs";
import { translate } from "@/lib/locale";
describe("language, region and appearance", () => {
  it("validates persisted modes, languages and IANA time zones", () => {
    expect(parseDisplayPrefs(JSON.stringify({ colorMode: "light", language: "fil", timeZone: "Asia/Manila" }))).toMatchObject({ colorMode: "light", language: "fil", timeZone: "Asia/Manila" });
    expect(parseDisplayPrefs(JSON.stringify({ colorMode: "<script>", language: "unknown", timeZone: "Not/AZone" }))).toMatchObject({ colorMode: "dark", language: "en", timeZone: "system" });
    expect(validTimeZone("America/Edmonton")).toBe(true); expect(validTimeZone(null)).toBe(false);
  });
  it("translates core navigation and uses the correct previous calendar day across DST", () => {
    expect(translate("Messages", "fil")).toBe("Mga mensahe"); expect(translate("Community-provided text", "fil")).toBe("Community-provided text");
    expect(formatTimestamp("2026-10-31T18:00:00Z", new Date("2026-11-02T04:30:00Z"), "America/New_York", true, "fil")).toMatch(/^Kahapon/);
    expect(formatTimestamp("2026-10-14T02:00:00Z", new Date("2026-10-14T04:00:00Z"), "Asia/Manila", true, "fil")).toBe("Ngayon 10:00");
  });
});
