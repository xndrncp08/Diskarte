import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
for (const mode of ["light", "system"] as const) {
  test(`${mode} appearance respects the OS, keeps readable forms and avoids overflow`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "diskarte-mode", value: mode, url: baseURL! }]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 375, height: 812 }); await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  });
}
test("light high contrast keeps dark focus rings and honors the OS transparency preference", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await context.addCookies([{ name: "diskarte-mode", value: "light", url: baseURL! }]);
  await page.emulateMedia({ colorScheme: "light", contrast: "more" }); await page.goto("/login");
  const glass = page.locator(".auth-panel").first();
  await expect(glass).toBeVisible();
  expect(await glass.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");
  await page.locator("html").evaluate((element) => element.setAttribute("data-high-contrast", ""));
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.press("Tab");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toBeFocused();
  expect(await password.evaluate((element) => getComputedStyle(element).outlineColor)).toBe("rgb(20, 33, 56)");
  await page.locator("html").evaluate((element) => element.removeAttribute("data-high-contrast"));
  await page.emulateMedia({ contrast: "no-preference" });
  const blur = () => page.evaluate(() => {
    const surface = document.createElement("div"); surface.className = "glass"; document.body.appendChild(surface);
    const value = getComputedStyle(surface).backdropFilter; surface.remove(); return value;
  });
  expect(await blur()).toBe("none");
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await blur()).toContain("blur(12px)");
});
