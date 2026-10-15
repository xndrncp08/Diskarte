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
    await expect(page.getByLabel("Email")).toBeVisible();
  });
}
