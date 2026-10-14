// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isGifOnlyMessage, isGiphyMedia } from "@/lib/gifs";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }) }));
const { GET } = await import("@/app/api/gifs/route");
const req = (q = "") => new NextRequest(new URL(`/api/gifs?q=${encodeURIComponent(q)}`, "https://diskarte.test"));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/gifs", () => {
  it("says it isn't set up without GIPHY_API_KEY", async () => {
    vi.stubEnv("GIPHY_API_KEY", "");
    expect((await GET(req("cat"))).status).toBe(503);
  });

  it("searches GIPHY server-side and returns only what the picker needs", async () => {
    vi.stubEnv("GIPHY_API_KEY", "secret-key");
    const fetchMock = vi.fn(async (url: string) => {
      void url;
      return Response.json({
        data: [
          { id: "abc", title: "Happy Cat", images: { fixed_width: { url: "https://media1.giphy.com/media/abc/200w.gif", webp: "https://media1.giphy.com/media/abc/200w.webp", width: "200", height: "150" }, downsized: { url: "https://media1.giphy.com/media/abc/giphy.gif?cid=x&rid=giphy.gif" } } },
          { id: "broken", images: {} },
        ],
        pagination: { total_count: 100 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(req("happy cat"));
    const body = await res.json();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/api\.giphy\.com\/v1\/gifs\/search\?.*q=happy\+cat.*rating=pg-13|rating=pg-13.*q=happy\+cat/);
    expect(body).toEqual({ gifs: [{ id: "abc", title: "Happy Cat", preview: "https://media1.giphy.com/media/abc/200w.webp", width: 200, height: 150, url: "https://media1.giphy.com/media/abc/giphy.gif" }], next: 24 });
    expect(JSON.stringify(body)).not.toContain("secret-key");
  });
});

describe("GIF links", () => {
  it("recognises GIPHY media files and GIF-only messages", () => {
    expect(isGiphyMedia("https://media2.giphy.com/media/abc/giphy.gif")).toBe(true);
    expect(isGiphyMedia("https://i.giphy.com/abc.webp")).toBe(true);
    expect(isGiphyMedia("https://giphy.com/gifs/abc")).toBe(false);
    expect(isGiphyMedia("http://media.giphy.com/media/abc/giphy.gif")).toBe(false);
    expect(isGiphyMedia("https://media.giphy.com.evil.ph/a.gif")).toBe(false);
    expect(isGifOnlyMessage(" https://media.giphy.com/media/abc/giphy.gif ")).toBe(true);
    expect(isGifOnlyMessage("lol https://media.giphy.com/media/abc/giphy.gif")).toBe(false);
  });
});
