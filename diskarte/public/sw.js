/* Static files only. Authenticated pages, API responses and private media never enter CacheStorage. */
const CACHE = "diskarte-static-v1";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"];
const staticAsset = (url) => url.origin === self.location.origin && !url.search &&
  (url.pathname.startsWith("/_next/static/") || /^\/icons\/[\w-]+\.png$/.test(url.pathname) || url.pathname === "/icon.svg");

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("diskarte-static-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }
  if (!staticAsset(new URL(request.url))) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type !== "opaque") {
      // Keep writes alive even if the page closes as a static chunk downloads.
      event.waitUntil((async () => {
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        // Bound disk usage without evicting the offline shell.
        const assets = keys.filter((key) => !PRECACHE.includes(new URL(key.url).pathname));
        await Promise.all(assets.slice(0, Math.max(0, assets.length - 150)).map((key) => cache.delete(key)));
      })().catch(() => undefined));
    }
    return response;
  })());
});
