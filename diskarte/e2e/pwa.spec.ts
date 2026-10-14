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
