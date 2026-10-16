import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const mode of ["dark", "light"] as const) {
  for (const width of [375, 1440]) {
    test(`${mode} authentication at ${width}px is accessible and stays within the viewport`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "diskarte-mode", value: mode, url: baseURL! }]);
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/login", "/signup", "/forgot-password"]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.locator("canvas")).toHaveCount(0);
        const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
        await page.getByLabel("Email", { exact: true }).focus();
        await expect(page.getByLabel("Email", { exact: true })).toBeInViewport();
        expect(await page.getByLabel("Email", { exact: true }).evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
      }
      await page.screenshot({ path: `test-results/auth-${mode}-${width}.png`, fullPage: true });
    });
  }
}

test("email remembering is opt-in and removable without storing the password", async ({ page }) => {
  await page.goto("/login?next=%2Ftambayan%2Ffriends");
  await page.evaluate(() => localStorage.setItem("diskarte-remembered-email", "juan@example.com"));
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("juan@example.com");
  await expect(page.getByLabel("Remember my email on this device")).toBeChecked();
  await page.getByLabel("Remember my email on this device").uncheck();
  expect(await page.evaluate(() => localStorage.getItem("diskarte-remembered-email"))).toBeNull();
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Ftambayan%2Ffriends$/);
});

test("landing electric logo runs only when allowed and can be paused", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const hero = page.getByTestId("hero-logo");
  await expect(hero.getByRole("img", { name: "Diskarte salakot mascot" })).toBeVisible();
  await expect.poll(() => hero.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(hero.locator("canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "Pause logo animation" }).click();
  await expect(hero.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Play logo animation" }).click();
  await expect(hero.locator("canvas")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(hero.locator("canvas")).toHaveCount(0);
  await expect(hero.getByRole("img", { name: "Diskarte salakot mascot" })).toBeVisible();
});

test("invalid callback and verification links show the shared accessible error screen", async ({ page }) => {
  for (const route of ["/auth/callback", "/auth/confirm"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.locator(".auth-panel").getByRole("alert")).toContainText("invalid or has expired");
    await expect(page.locator(".auth-panel")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  }
});
