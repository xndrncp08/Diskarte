import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, makeUser, sendMessage, signUpAndOnboard } from "./helpers";

/** Real-browser axe audits (includes color-contrast, which jsdom can't evaluate). */
async function audit(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join(", ")}`);
}

test.describe("accessibility audit — public pages", () => {
  for (const path of ["/", "/login", "/signup", "/forgot-password"]) {
    test(`no WCAG 2.1 AA violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("load");
      expect(await audit(page)).toEqual([]);
    });
  }

  test("keyboard: skip-free tab order reaches the primary action with a visible focus ring", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    const outline = await page.getByLabel("Password", { exact: true }).evaluate((el) => getComputedStyle(el).boxShadow + getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("nonenone");
  });
});

test.describe("accessibility audit — app shell", () => {
  test.skip(!FULL, FULL_REASON);

  test("chat shell has no WCAG 2.1 AA violations", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("A11y"));
    await createServer(page, `A11y ${Date.now().toString(36)}`);
    await sendMessage(page, "Accessible ba 'to? **Oo**!");
    expect(await audit(page)).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});
