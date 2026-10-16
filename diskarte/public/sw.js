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

/* Private push metadata lives in IndexedDB, never the offline HTTP cache. No auth tokens are stored. */
function pushStore(change) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("diskarte-push", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("state");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction("state", change ? "readwrite" : "readonly"), store = tx.objectStore("state");
      let value;
      const read = store.get("current");
      read.onsuccess = () => { value = read.result || { userId: null, seen: [], latest: {} }; if (change) { value = change(value); store.put(value, "current"); } };
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
const pushPath = (path) => typeof path === "string" && /^\/(tambayan|settings)(\/|\?|$)/.test(path) && !/[\\\r\n]/.test(path) ? path : "/tambayan";
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
let pushSerial = Promise.resolve();
async function pushBadge(count) {
  try { await (count > 0 ? self.navigator.setAppBadge?.(Math.min(count,9999)) : self.navigator.clearAppBadge?.()); }
  catch { /* Optional OS badges must never prevent notification display or account cleanup. */ }
}
self.addEventListener("message", (event) => {
  if (event.data?.type !== "PUSH_BIND") return;
  pushSerial = pushSerial.catch(() => undefined).then(async () => {
    try {
      const userId = uuid(event.data.userId) ? event.data.userId : null;
      const previous = await pushStore();
      await pushStore((old) => old.userId === userId ? old : { userId, seen: [], latest: {} });
      if (!userId || previous.userId !== userId) {
        const notices = await self.registration.getNotifications(); notices.forEach((notice) => notice.close());
        await pushBadge(0);
      }
      event.ports?.[0]?.postMessage({ ok: true });
    } catch { event.ports?.[0]?.postMessage({ ok: false }); }
  });
  event.waitUntil(pushSerial);
});
self.addEventListener("push", (event) => {
  // Serialize duplicate events through the same persistent idempotency record.
  pushSerial = pushSerial.catch(() => undefined).then(async () => {
    let payload; try { payload = event.data?.json(); } catch { return; }
    if (payload?.version !== 1 || !uuid(payload.id) || !uuid(payload.userId) || typeof payload.title !== "string" || typeof payload.body !== "string" || typeof payload.tag !== "string" || !Number.isFinite(payload.timestamp)) return;
    const state = await pushStore();
    // A queued vendor delivery may race sign-out. Never display the previous account's contents.
    if (!state.userId || state.userId !== payload.userId) {
      await self.registration.showNotification("Diskarte", { body: "Open Diskarte to check for updates.", tag: "diskarte-session", icon: "/icons/icon-192.png", data: { href: "/tambayan" } });
      return;
    }
    if (state.seen.includes(payload.id) || (state.latest[payload.tag] || 0) > payload.timestamp) return;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Already reading that conversation in a visible, focused window: the page shows it; no alert.
    const target = new URL(pushPath(payload.href), self.location.origin).pathname;
    const looking = clients.some((client) => client.visibilityState === "visible" && client.focused && new URL(client.url).pathname === target);
    if (looking) {
      await pushStore((old) => old.userId !== payload.userId ? old : { ...old, seen: [...old.seen.slice(-99), payload.id] });
      clients.forEach((client) => client.postMessage({ type: "PUSH_ACTIVITY" }));
      return;
    }
    const options = { body: payload.body.slice(0,180), icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: payload.tag.slice(0,100), timestamp: payload.timestamp, silent: payload.silent === true, renotify: false,
      data: { id: payload.id, userId: payload.userId, href: pushPath(payload.href) }, actions: [{ action: "open", title: "Open Diskarte" }, { action: "dismiss", title: "Dismiss" }] };
    await self.registration.showNotification(payload.title.slice(0,100), options);
    await pushStore((old) => old.userId !== payload.userId ? old : { ...old, seen: [...old.seen.slice(-99),payload.id], latest: { ...Object.fromEntries(Object.entries(old.latest).slice(-99)),[payload.tag]:payload.timestamp } });
    if (typeof payload.badge === "number") await pushBadge(payload.badge);
    clients.forEach((client) => client.postMessage({ type: "PUSH_ACTIVITY" }));
  });
  event.waitUntil(pushSerial);
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  event.waitUntil((async () => {
    const data = event.notification.data || {}, state = await pushStore();
    const path = !data.userId || data.userId === state.userId ? pushPath(data.href) : "/tambayan";
    const target = new URL(path, self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find((item) => new URL(item.url).origin === self.location.origin && "navigate" in item);
    if (client) { const navigated = await client.navigate(target); await (navigated || client).focus(); }
    else await self.clients.openWindow(target);
  })());
});
self.addEventListener("pushsubscriptionchange", (event) => {
  // Subscription renewal requires authenticated ownership. Prompt only on next user interaction.
  event.waitUntil(self.clients.matchAll({ type:"window",includeUncontrolled:true }).then((clients) => clients.forEach((client) => client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" }))));
});
