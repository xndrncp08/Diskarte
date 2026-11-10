import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SERVER_ID } from "../fixtures/server";

// Step 5b: the Pulse community landing, Explore, Home, Messages (inbox) and Friends on the same fixture as pulse-shell.
const ROUTES = { landing: `/tambayan/${SERVER_ID}`, explore: "/tambayan/explore", home: "/tambayan", messages: "/tambayan/messages", friends: "/tambayan/friends" };

async function pulse(page: Page, mode: "dark" | "light") {
  await page.context().addCookies([{ name: "diskarte-shell", value: "pulse", url: "http://127.0.0.1:3130" }]);
  await page.addInitScript((mode) => localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: mode })), mode);
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
}

for (const mode of ["dark", "light"] as const) {
  for (const width of [390, 1280]) {
    test(`Pulse communities, ${mode} at ${width}px: accessible, no overflow, Masthead h1`, async ({ page }) => {
      await pulse(page, mode);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const [name, route] of Object.entries(ROUTES)) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-shell", "pulse");
        await expect(page.locator("#main-content [data-pulse-masthead] h1")).toBeVisible();
        if (name === "landing") {
          await expect(page.getByTestId("community-landing")).toBeVisible();
          await expect(page.getByTestId("community-accent")).toBeVisible();
          await expect(page.getByTestId("tile-rooms").getByRole("link").first()).toBeVisible();
        }
        if (name === "explore") await expect(page.getByTestId("explore-results").getByRole("button", { name: /Open Barkada HQ/ })).toBeVisible();
        if (name === "messages") await expect(page.getByTestId("messages-list").getByRole("link")).toHaveCount(1);
        if (name === "home") await expect(page.getByRole("heading", { name: "Where should I go next?" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows`).toBe(true);
        const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        expect(audit.violations.map(({ id, nodes }) => ({ name, id, nodes: nodes.map((n) => `${n.target.join(" ")}: ${n.html.slice(0, 140)} ${n.failureSummary ?? ""}`) }))).toEqual([]);
        await page.screenshot({ path: `test-results/pulse-communities-${mode}-${width}-${name}.png`, fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
}

test("Pulse inbox filters to unread and Explore filters by category", async ({ page }) => {
  await pulse(page, "dark");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(ROUTES.messages);
  await page.getByRole("radio", { name: /Unread/ }).click();
  await expect(page.getByTestId("messages-list").getByRole("link")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search conversations" }).fill("zzz");
  await expect(page.getByRole("heading", { name: "No conversations match" })).toBeVisible();
  await page.goto(ROUTES.explore);
  await page.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Study" }).click();
  await expect(page.getByRole("radio", { name: "Study" })).toHaveAttribute("aria-checked", "true");
});
