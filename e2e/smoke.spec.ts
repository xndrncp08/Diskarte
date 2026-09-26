import { expect, test } from "@playwright/test";

test.describe("smoke (no backend required)", () => {
  test("landing page shows the brand and calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Diskarte" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Walang Shutdown-Shutdown");
    await expect(page.getByRole("link", { name: /Gumawa ng account/ })).toHaveAttribute("href", "/signup");
  });

  test("health endpoint reports liveness", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toMatchObject({ service: "diskarte" });
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  test("pages ship a nonce-based CSP and hardening headers", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the app area requires signing in", async ({ page }) => {
    await page.goto("/tambayan");
    await expect(page).toHaveURL(/\/login\?next=%2Ftambayan/);
    await expect(page.getByRole("heading", { name: "Welcome back, kabayan!" })).toBeVisible();
  });

  test("cross-site POSTs to the API are rejected", async ({ request }) => {
    const res = await request.post("/api/livekit/token", { headers: { origin: "https://evil.example" }, data: { channelId: "x" } });
    expect(res.status()).toBe(403);
  });

  test("sign-up form validates input client- and server-side", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Display name").fill("Juan");
    await page.getByLabel("Username").fill("x");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Sali na!" }).click();
    await expect(page.getByText("3–32 characters: letters, numbers, underscore o tuldok lang.")).toBeVisible();
    await expect(page.getByText("Mukhang mali ang email")).toBeVisible();
    await expect(page.getByText("Minimum 8 characters ang password")).toBeVisible();
  });
});
