import { describe, expect, it } from "vitest";
import { excerpt, searchDocs, type SearchEntry } from "@/lib/docs/search";

const index: SearchEntry[] = [
  { s: "help/notifications", a: "iphone-and-ipad", p: "Notification issues", c: "Help", h: "iPhone and iPad", t: "Notifications only work when Diskarte is installed to the Home Screen." },
  { s: "guides/messages", a: "schedule-a-message", p: "Messages", c: "User guides", h: "Schedule a message", t: "Pick a time up to 30 days ahead. Notifications are not involved." },
  { s: "api", a: "", p: "API reference", c: "API", h: "API reference", t: "POST /api/webhooks/<id>/<token> posts into a channel." },
];

describe("docs search", () => {
  it("ranks heading matches above text matches and links to the heading", () => {
    const hits = searchDocs(index, "notifications");
    expect(hits.map((h) => h.href)).toEqual(["/docs/help/notifications#iphone-and-ipad", "/docs/guides/messages#schedule-a-message"]);
  });

  it("requires every term, matches word prefixes and filters by section", () => {
    expect(searchDocs(index, "sched mess").map((h) => h.entry.a)).toEqual(["schedule-a-message"]);
    expect(searchDocs(index, "schedule iphone")).toEqual([]);
    expect(searchDocs(index, "notifications", "Help")).toHaveLength(1);
    expect(searchDocs(index, "/api/webhooks")[0].href).toBe("/docs/api");
  });

  it("ignores empty or one-letter queries", () => {
    expect(searchDocs(index, "  a ")).toEqual([]);
  });

  it("builds a highlightable excerpt around the first match", () => {
    const e = excerpt("x".repeat(300) + " Home Screen " + "y".repeat(300), ["home"]);
    expect(e.match).toBe("Home");
    expect(e.before.startsWith("…")).toBe(true);
    expect(e.after.endsWith("…")).toBe(true);
  });
});
