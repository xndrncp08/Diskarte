import { expect, test } from "@playwright/test";

test("PWA caches static files and gives an offline fallback without private page caching", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  await context.setOffline(true);
  await page.goto("/tambayan/messages");
  await expect(page.getByRole("heading", { name: /Balik tayo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/tambayan");
  const keys = await page.evaluate(async () => {
    const result: string[] = [];
    for (const name of await caches.keys()) {
      if (name.startsWith("diskarte-static-")) for (const key of await (await caches.open(name)).keys()) result.push(new URL(key.url).pathname);
    }
    return result;
  });
  expect(keys).toContain("/offline.html");
  expect(keys.filter((path) => path.startsWith("/tambayan") || path.startsWith("/api/"))).toEqual([]);
  await context.setOffline(false);
});

test("service worker receives a push with no Diskarte page open and persists duplicate suppression", async ({ page, context }) => {
  await context.grantPermissions(["notifications"]);
  await page.goto("/");
  const scope = new URL("/",page.url()).href;
  const cdp = await context.newCDPSession(page);
  let registrationId = "";
  cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => { for (const registration of registrations) if (registration.scopeURL === scope) registrationId = registration.registrationId; });
  await cdp.send("ServiceWorker.enable");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => registrationId).not.toBe("");
  const userId = "00000000-0000-4000-8000-000000000001";
  await page.evaluate(async (userId) => {
    const registration = await navigator.serviceWorker.ready;
    await new Promise<void>((resolve, reject) => { const channel = new MessageChannel(); channel.port1.onmessage = (e) => { channel.port1.close(); if(e.data.ok) resolve(); else reject(new Error("Push binding failed")); }; registration.active!.postMessage({ type: "PUSH_BIND", userId }, [channel.port2]); });
  }, userId);
  const origin = new URL(page.url()).origin;
  const data = JSON.stringify({ version:1,id:"00000000-0000-4000-8000-000000000002",userId,title:"Diskarte push test",body:"Worker-only delivery",href:"/tambayan/messages",tag:"push-e2e",timestamp:Date.now(),badge:1 });
  // CDP injects a standards PushEvent for deterministic browser coverage; this is not live vendor delivery.
  await page.goto("about:blank");
  await cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId, data });
  await page.goto(origin);
  await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({tag:"push-e2e"})).map((n) => n.body))).toEqual(["Worker-only delivery"]);
  await cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId, data });
  await expect.poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications({tag:"push-e2e"})).length)).toBe(1);
});
