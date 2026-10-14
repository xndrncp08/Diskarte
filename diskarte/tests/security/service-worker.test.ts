// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined), keys: vi.fn(async () => []), addAll: vi.fn(async () => undefined), delete: vi.fn(async () => true) };
  const fallback = new Response("Offline");
  const caches = { open: vi.fn(async () => cache), match: vi.fn(async () => fallback), keys: vi.fn(async () => []), delete: vi.fn() };
  const fetch = vi.fn(async () => new Response("network response"));
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), { self: { location: { origin: "https://diskarte.test" }, addEventListener: (type: string, callback: (event: unknown) => void) => { handlers[type] = callback; }, clients: { claim: vi.fn() } }, caches, fetch, URL, Response });
  const request = (path: string, mode = "cors", method = "GET") => {
    const respondWith = vi.fn(); const waitUntil = vi.fn();
    handlers.fetch({ request: { url: `https://diskarte.test${path}`, mode, method }, respondWith, waitUntil });
    return { respondWith, waitUntil };
  };
  return { request, cache, fetch, caches, handlers };
}

describe("offline cache privacy", () => {
  it("never intercepts API, private media, images with signed URLs or message mutations", () => {
    const w = worker();
    for (const [path, mode, method] of [["/api/search", "cors", "GET"], ["/storage/v1/object/sign/attachments/a?token=secret", "cors", "GET"], ["/_next/image?url=private", "cors", "GET"], ["/tambayan", "navigate", "POST"]]) {
      expect(w.request(path, mode, method).respondWith).not.toHaveBeenCalled();
    }
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it("fetches authenticated navigation without caching its response and falls back only on connection failure", async () => {
    const w = worker();
    const normal = w.request("/tambayan/private", "navigate");
    expect(await normal.respondWith.mock.calls[0][0]).toBeInstanceOf(Response);
    expect(w.cache.put).not.toHaveBeenCalled();
    w.fetch.mockRejectedValueOnce(new TypeError("offline"));
    const offline = w.request("/tambayan/private", "navigate");
    expect(await (await offline.respondWith.mock.calls[0][0]).text()).toBe("Offline");
    expect(w.cache.put).not.toHaveBeenCalled();
  });
  it("caches only same-origin static assets", async () => {
    const w = worker();
    const staticRequest = w.request("/_next/static/chunks/hash.js");
    await staticRequest.respondWith.mock.calls[0][0];
    await Promise.all(staticRequest.waitUntil.mock.calls.map(([promise]) => promise));
    expect(w.cache.put).toHaveBeenCalledOnce();
    expect(w.request("/icons/icon-192.png?token=private").respondWith).not.toHaveBeenCalled();
  });
});
