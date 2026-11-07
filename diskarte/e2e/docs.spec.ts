import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The Help Center is public: none of this needs Supabase or LiveKit.

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
}

test("the Help Center home links into every audience without signing in", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("figure it out");
  for (const group of ["Getting started", "User guides", "Developers", "Help and troubleshooting"]) {
    await expect(page.getByRole("heading", { name: group })).toBeVisible();
  }
  await page.getByRole("link", { name: /Connection problems/ }).click();
  await expect(page).toHaveURL(/\/docs\/help\/connection$/);
  await expect(page.getByRole("heading", { level: 1, name: "Connection problems" })).toBeVisible();
});

test("article pages have breadcrumbs, a table of contents, pager and rendered diagrams", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/docs/developers/architecture");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Developers");
  await expect(page.locator("[data-docs-toc] a").first()).toBeVisible();
  await expect(page.locator("figure[data-mermaid][data-rendered] svg").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("figure[data-failed]")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Previous and next pages" }).getByRole("link")).toHaveCount(2);
  await page.getByRole("link", { name: "Realtime and message delivery" }).first().click();
  await expect(page).toHaveURL(/\/docs\/developers\/realtime$/);
});

test("code blocks copy and headings have anchors", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/developers/local-setup");
  const block = page.locator(".docs-code").first();
  await block.getByRole("button", { name: "Copy" }).click();
  await expect(block.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("git clone");
  await expect(page.locator('h2[id="1-install"] a.docs-anchor')).toHaveAttribute("href", "#1-install");
});

test("search finds sections from the keyboard and opens the heading", async ({ page }) => {
  await page.goto("/docs");
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search the documentation" });
  await expect(input).toBeFocused();
  await input.fill("quiet hours");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.getByRole("button", { name: "Help and troubleshooting" }).click();
  await expect(page.getByRole("option").first()).toContainText("Help and troubleshooting");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/docs\/help\/[a-z-]+/);
});

test("internal runbooks are not published or searchable", async ({ page, request }) => {
  for (const path of ["/docs/operations/deployment", "/docs/architecture/background-jobs", "/docs/reference/database"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const index = await (await request.get("/docs-assets/search-index.json")).text();
  expect(index).not.toContain("Incident response");
  expect(index).not.toContain("Backup and restore");
  await page.goto("/docs/help/faq");
  await expect(page.locator("a[href*='/docs/operations']")).toHaveCount(0);
});

test("colour mode switches and survives a reload", async ({ page }) => {
  await page.goto("/docs/guides/messages");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
});

test("phones get the section menu and no horizontal scrolling", async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/docs/api");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("Browse the Help Center").click();
  await page.locator(".docs-mobile-nav").getByRole("link", { name: "Sign-in and account recovery" }).click();
  await expect(page).toHaveURL(/\/docs\/help\/sign-in$/);
});

test("Help Center pages pass axe in dark and light mode", async ({ page, context }) => {
  for (const mode of ["dark", "light"]) {
    for (const path of ["/docs", "/docs/guides/calls", "/docs/api"]) {
      await page.goto(path);
      await context.addCookies([{ name: "diskarte-mode", value: mode, url: new URL(page.url()).origin }]);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-color-mode", mode);
      expect(await audit(page), `${mode} ${path}`).toEqual([]);
    }
  }
});

test("the sign-in page links to account recovery help", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Trouble signing in?" })).toHaveAttribute("href", "/docs/help/sign-in");
});
