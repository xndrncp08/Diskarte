import { expect, test } from "@playwright/test";
import { settleEntrance } from "./helpers";

test.describe("smoke (no backend required)", () => {
  test("landing page shows the brand and calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Diskarte" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Walang Shutdown-Shutdown");
    await expect(page.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", "/signup");
  });

  test("the 3D hero stays decorative: hidden from assistive tech, never in the way of a click", async ({ page }) => {
    await page.goto("/");
    await settleEntrance(page);
    const layer = page.locator("[data-scene]").first();
    await expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    await page.getByRole("link", { name: /Create an account/ }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("reduced motion gets the static sun and never downloads the WebGL scene", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const scripts: string[] = [];
    page.on("response", (res) => res.request().resourceType() === "script" && scripts.push(res.url()));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-scene]").first()).toHaveAttribute("data-scene", "static");
    await expect(page.locator("canvas")).toHaveCount(0);
    const bodies = await Promise.all(scripts.map((url) => page.request.get(url).then((r) => r.text())));
    expect(bodies.some((js) => js.includes("WebGLRenderer"))).toBe(false);
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
    await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
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
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("3–32 characters: letters, numbers, underscores or periods only.")).toBeVisible();
    await expect(page.getByText("That email doesn't look right")).toBeVisible();
    await expect(page.getByText(/Password needs: 10\+ characters/)).toBeVisible();
    await expect(page.getByTestId("password-rules")).toContainText("uppercase letter");
    await expect(page.getByText("Passwords don't match")).toBeVisible();
  });

  test("sign-up blocks a mismatched password confirmation", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Password", { exact: true }).fill("Kape-Muna-2026");
    await page.getByLabel("Confirm password").fill("Kape-Muna-2025");
    await expect(page.getByText("Passwords don't match")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeDisabled();
    await page.getByLabel("Confirm password").fill("Kape-Muna-2026");
    await expect(page.getByRole("button", { name: "Sign up" })).toBeEnabled();
  });

  test("sign-in password can be shown and hidden without losing focus or text", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("Kape-Muna-2026");
    await expect(password).toHaveAttribute("type", "password");
    const toggle = page.getByRole("button", { name: "Show password" });
    await toggle.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(password).toBeFocused();
    await expect(password).toHaveValue("Kape-Muna-2026");
    await toggle.click();
    await expect(password).toHaveAttribute("type", "password");
  });
});

test.describe("security smoke", () => {
  test("auth endpoints answer brute force with 429 + Retry-After", async ({ request }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    const attempt = () => request.post("/login", { headers: { "x-forwarded-for": ip, origin: "http://localhost" }, form: { email: "x@y.z", password: "nope" }, maxRedirects: 0 });
    const budget = Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? 5);
    test.skip(budget > 20, "auth rate limit raised for this run");
    for (let i = 0; i < budget; i++) await attempt();
    const blocked = await attempt();
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  });

  test("API rejects foreign-origin preflights", async ({ request }) => {
    const res = await request.fetch("/api/livekit/token", { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("protected API requires a session", async ({ request, baseURL }) => {
    const res = await request.post("/api/livekit/token", { headers: { origin: new URL(baseURL!).origin }, data: { channelId: "00000000-0000-4000-8000-000000000000" } });
    expect(res.status()).toBe(401);
  });
});
