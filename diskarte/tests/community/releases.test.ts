import { describe, expect, it, vi } from "vitest";
import { formatReleasePost, unseenReleases, type Release } from "@/lib/releases";

const release = (id: string): Release => ({ id, date: id.slice(0, 10), title: `Title ${id}`, summary: "Summary.", highlights: [{ title: "Thing", text: "does stuff.", href: "/docs/help/faq" }], fixes: ["Fixed a bug."], links: [{ label: "Help Center", href: "/docs" }] });

describe("release notes", () => {
  it("formats a deterministic post with absolute Help Center links", () => {
    const post = formatReleasePost(release("2026-11-07-a"), "https://diskarte.example/");
    expect(post).toBe(["## Title 2026-11-07-a", "*November 7, 2026*", "", "> [!INFO]", "> Summary.", "", "### What's new", "- **Thing** — does stuff. [Learn more](https://diskarte.example/docs/help/faq)", "", "### Fixed", "- Fixed a bug.", "", "[Help Center](https://diskarte.example/docs)"].join("\n"));
  });

  it("lists what's new since the last acknowledged release", () => {
    const list = [release("2026-11-09-c"), release("2026-11-08-b"), release("2026-11-07-a")];
    expect(unseenReleases("2026-11-07-a", list).map((r) => r.id)).toEqual(["2026-11-09-c", "2026-11-08-b"]);
    expect(unseenReleases("2026-11-09-c", list)).toEqual([]);
    expect(unseenReleases("unknown", list).map((r) => r.id)).toEqual(["2026-11-09-c"]);
  });
});

describe("release announcer", () => {
  it("only runs when opted in, on production, with the service role", async () => {
    vi.doMock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
    const { releaseAnnouncementsEnabled } = await import("@/lib/releases-server");
    const base = { RELEASE_ANNOUNCEMENTS: "on", SUPABASE_SERVICE_ROLE_KEY: "x" };
    expect(releaseAnnouncementsEnabled(base)).toBe(true);
    expect(releaseAnnouncementsEnabled({ ...base, VERCEL_ENV: "production" })).toBe(true);
    expect(releaseAnnouncementsEnabled({ ...base, VERCEL_ENV: "preview" })).toBe(false);
    expect(releaseAnnouncementsEnabled({ ...base, RELEASE_ANNOUNCEMENTS: undefined })).toBe(false);
    expect(releaseAnnouncementsEnabled({ RELEASE_ANNOUNCEMENTS: "on" })).toBe(false);
  });

  it("asks the database to publish the newest release once and reports the outcome", async () => {
    const { announceRelease } = await import("@/lib/releases-server");
    const rpc = vi.fn().mockResolvedValueOnce({ data: "published", error: null }).mockResolvedValueOnce({ data: "already-published", error: null }).mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    const db = { rpc } as never;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await announceRelease(release("2026-11-07-a"), db, "https://diskarte.example")).toBe("published");
    expect(await announceRelease(release("2026-11-07-a"), db, "https://diskarte.example")).toBe("already-published");
    expect(await announceRelease(release("2026-11-07-a"), db, "https://diskarte.example")).toBe("failed");
    expect(rpc).toHaveBeenCalledWith("publish_release_announcement", expect.objectContaining({ p_release_id: "2026-11-07-a", p_released_on: "2026-11-07" }));
    expect(log.mock.calls.map((c) => JSON.parse(c[0] as string).result)).toEqual(["published", "already-published", "failed"]);
    log.mockRestore();
  });
});
