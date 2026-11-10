import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { channels, SERVER_ID, server } from "../fixtures/server";

// The Pulse shell (diskarte-shell=pulse) around the same real pages as experience.spec.ts.
const ROUTES = ["/tambayan", `/tambayan/${SERVER_ID}/${channels[0].id}`, `/tambayan/${SERVER_ID}/workspace`, "/tambayan/friends", "/tambayan/messages", "/tambayan/explore"];
const name = (route: string) => (route === "/tambayan" ? "home" : route.endsWith(channels[0].id) ? "channel" : route.split("/").pop());

async function pulse(page: Page, mode: "dark" | "light") {
  await page.context().addCookies([{ name: "diskarte-shell", value: "pulse", url: "http://127.0.0.1:3130" }]);
  await page.addInitScript((mode) => localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: mode })), mode);
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
}

async function expectNoAxeViolations(page: Page) {
  // Reduced motion still fades opacity (framer-motion), so wait until every overlay is fully opaque.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[role=dialog],[role=menu]")).every((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) if (getComputedStyle(node).opacity !== "1") return false;
      return true;
    }),
  );
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => `${node.target.join(" ")}: ${node.html.slice(0, 140)} ${node.failureSummary ?? ""}`) }))).toEqual([]);
}

for (const mode of ["dark", "light"] as const) {
  for (const width of [390, 768, 1280, 1440]) {
    test(`Pulse shell, ${mode} at ${width}px: accessible, no overflow, one h1 in the canvas`, async ({ page }) => {
      await pulse(page, mode);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-shell", "pulse");
        await expect(page.locator("[data-pulse-shell]")).toBeVisible();
        await expect(page.locator("#main-content")).toBeVisible();
        await expect(page.locator("#main-content").getByRole("heading", { level: 1 }).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expectNoAxeViolations(page);
        if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/pulse-shell-${mode}-${width}-${name(route)}.png` });
      }
      if (width < 768) {
        await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.getByTestId("pulse-rooms")).toBeVisible();
        // The drawer starts on where you are, not its first button (whose tooltip would cover the header).
        await expect(page.getByTestId("pulse-rooms").getByRole("link", { name: channels[0].name })).toBeFocused();
        await expectNoAxeViolations(page);
        await page.screenshot({ path: `test-results/pulse-shell-${mode}-${width}-navigator.png` });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
      }
      await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
      await page.getByTestId("context-toggle").click();
      const sheet = page.getByRole("dialog", { name: "Context" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "true");
      await expectNoAxeViolations(page);
      await sheet.getByRole("tab", { name: "About" }).click();
      await expect(sheet.getByText(server.name)).toBeVisible();
      await page.screenshot({ path: `test-results/pulse-shell-${mode}-${width}-context.png` });
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      expect(errors).toEqual([]);
    });
  }
}

test("Pulse skip link, navigator keys and pinned Context", async ({ page }) => {
  await pulse(page, "dark");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/tambayan/friends");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  // Alt+1 opens the first Space (Ctrl/⌘+1 stays the browser's); its rooms expand under it.
  await page.keyboard.press("Alt+Digit1");
  await expect(page).toHaveURL(new RegExp(`/tambayan/${SERVER_ID}`));
  const rooms = page.getByTestId("pulse-rooms");
  await expect(rooms.getByRole("link", { name: channels[0].name })).toBeVisible();

  // ↓/↑ move between rows; Escape returns to the canvas.
  const lfg = rooms.getByRole("link", { name: "LFG Board" });
  await lfg.focus();
  await page.keyboard.press("ArrowDown");
  await expect(rooms.getByRole("link", { name: "Shared workspace" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(lfg).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#main-content")).toBeFocused();

  // Pinned beside the canvas at ≥ 1200 px, remembered across a reload.
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  await page.getByTestId("context-toggle").click();
  await page.getByRole("button", { name: "Keep open beside the conversation" }).click();
  await expect(page.getByTestId("context-panel")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("context-panel")).toBeVisible();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: "test-results/pulse-shell-dark-1280-docked.png" });
});
