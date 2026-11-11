import { expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { channels, SERVER_ID, server } from "../fixtures/server";
import { DM_ID } from "./pulse-messaging-data";

// Step 6b: Pulse on phones (browser emulation: Chromium with touch and a phone viewport, not a real device).
const SCREENS = { home: "/tambayan", people: "/tambayan/messages", spaces: "/tambayan/spaces", you: "/tambayan/you", landing: `/tambayan/${SERVER_ID}`, dm: `/tambayan/dm/${DM_ID}`, room: `/tambayan/${SERVER_ID}/${channels[0].id}` };
const TOP = new Set(["home", "people", "spaces", "you", "landing"]);
const SIZES = [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }];
const BASE = "http://127.0.0.1:3130";

async function phone(browser: Browser, mode: "dark" | "light", viewport: { width: number; height: number }) {
  const context = await browser.newContext({ baseURL: BASE, viewport, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await context.addCookies([{ name: "diskarte-shell", value: "pulse", url: BASE }]);
  await context.addInitScript((mode) => localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: mode })), mode);
  const page = await context.newPage();
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
  return page;
}

async function expectNoAxeViolations(page: Page, name: string) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[role=dialog],[role=menu]")).every((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) if (getComputedStyle(node).opacity !== "1") return false;
      return true;
    }),
  );
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.map(({ id, nodes }) => ({ name, id, nodes: nodes.map((n) => `${n.target.join(" ")}: ${n.html.slice(0, 140)} ${n.failureSummary ?? ""}`) }))).toEqual([]);
}

/** Visible controls under `scope` smaller than 44 × 44 px (inline text links are exempt, as in WCAG 2.5.8). */
function smallTargets(page: Page, scope: string) {
  return page.evaluate((scope) => {
    const out: string[] = [];
    for (const root of document.querySelectorAll(scope))
      for (const el of root.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [role=tab], [role=radio], [role=switch], [role=menuitem]")) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(el).display === "inline" || el.closest("[inert], [aria-hidden=true]")) continue;
        if (box.width < 43.5 || box.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    return out;
  }, scope);
}

for (const mode of ["dark", "light"] as const) {
  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    const landscape = size.width > size.height;
    test(`Pulse phone, ${mode} at ${tag}: tabs only on top-level screens, accessible, no overflow, 44 px targets`, async ({ browser }) => {
      const page = await phone(browser, mode, size);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const [name, route] of Object.entries(SCREENS)) {
        await page.goto(route);
        await expect(page.locator("#main-content h1").first()).toBeVisible();
        const tabs = page.getByRole("navigation", { name: "Main destinations" });
        // Landscape phones (≥ 768 px wide) get the tablet layout: navigator column, no tab bar.
        if (TOP.has(name) && !landscape) await expect(tabs).toBeVisible();
        else await expect(tabs).toBeHidden();
        if (!landscape) await expect(page.getByRole("button", { name: TOP.has(name) ? "Open navigation" : "Back" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows`).toBe(true);
        await expectNoAxeViolations(page, name);
        // Pulse's own phone chrome and screens: the masthead, the tab bar and the Spaces, You and People pages.
        const scope = ["[data-pulse-masthead]", "[data-testid=pulse-phone-nav]", ...(["spaces", "you", "people"].includes(name) ? ["#main-content"] : [])].join(", ");
        expect(await smallTargets(page, scope), `${name}: targets under 44 px`).toEqual([]);
        await page.screenshot({ path: `test-results/pulse-mobile-${mode}-${tag}-${name}.png` });
      }
      expect(errors).toEqual([]);
      await page.context().close();
    });
  }
}

test("Pulse phone flows: tabs, a conversation and Back, Spaces to a room, edge swipe, focus on arrival", async ({ browser }) => {
  const page = await phone(browser, "dark", { width: 390, height: 844 });
  const tabs = page.getByRole("navigation", { name: "Main destinations" });
  await page.goto("/tambayan");
  await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  // People: the inbox, focus on its h1; a conversation takes the whole screen.
  await tabs.getByRole("link", { name: /People/ }).tap();
  await expect(page).toHaveURL(/\/tambayan\/messages$/);
  await expect(page.locator("#main-content h1")).toBeFocused();
  await expect(page.locator("#main-content").getByRole("button", { name: "Start a Hangout" })).toBeVisible();
  await page.getByTestId("messages-list").getByRole("link").first().tap();
  await expect(page).toHaveURL(new RegExp(`/tambayan/dm/${DM_ID}$`));
  await expect(tabs).toBeHidden();
  await expect(page.locator("#main-content h1")).toBeFocused();
  await page.getByRole("button", { name: "Back" }).tap();
  await expect(page).toHaveURL(/\/tambayan\/messages$/);
  await expect(tabs).toBeVisible();

  // Spaces → a Space's landing (still a Spaces screen) → a room, then an edge swipe goes back to the landing.
  await tabs.getByRole("link", { name: "Spaces" }).tap();
  await expect(page).toHaveURL(/\/tambayan\/spaces$/);
  await page.getByRole("list", { name: "Your Spaces" }).getByRole("link", { name: new RegExp(server.name) }).tap();
  await expect(page).toHaveURL(new RegExp(`/tambayan/${SERVER_ID}$`));
  await expect(tabs.getByRole("link", { name: "Spaces" })).toHaveAttribute("aria-current", "page");
  await page.goto(SCREENS.room);
  await expect(tabs).toBeHidden();
  await page.locator("[data-pulse-shell]").evaluate((shell) => {
    const touch = (x: number) => [new Touch({ identifier: 1, target: shell, clientX: x, clientY: 400 })];
    shell.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: touch(6), changedTouches: touch(6) }));
    shell.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: touch(110), changedTouches: touch(110) }));
    shell.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: touch(110) }));
  });
  await expect(page).toHaveURL(new RegExp(`/tambayan/${SERVER_ID}$`));

  // Deep link: Back from a room you opened directly goes to its Space's landing.
  await page.goto(SCREENS.room);
  await page.getByRole("button", { name: "Back" }).tap();
  await expect(page).toHaveURL(new RegExp(`/tambayan/${SERVER_ID}$`));
  await page.context().close();
});

test("Pulse phone sheets: long-press a Space, the Context sheet, Escape closes", async ({ browser }) => {
  for (const mode of ["dark", "light"] as const) {
    const page = await phone(browser, mode, { width: 390, height: 844 });
    await page.goto("/tambayan/spaces");
    const row = page.getByRole("list", { name: "Your Spaces" }).getByRole("link", { name: new RegExp(server.name) });
    const box = (await row.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = [{ x: box.x + 40, y: box.y + box.height / 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const sheet = page.getByRole("dialog", { name: `${server.name} options` });
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-sheet", "bottom");
    await expect(sheet.getByRole("menuitem").first()).toBeVisible();
    await expect(page).toHaveURL(/\/tambayan\/spaces$/); // the long-press didn't also open the Space
    await expectNoAxeViolations(page, "space sheet");
    await page.screenshot({ path: `test-results/pulse-mobile-${mode}-390x844-space-sheet.png` });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page.goto(SCREENS.room);
    await page.getByTestId("context-toggle").tap();
    const context = page.getByRole("dialog", { name: "Context" });
    await expect(context).toHaveAttribute("data-sheet", "bottom");
    await expectNoAxeViolations(page, "context sheet");
    await page.screenshot({ path: `test-results/pulse-mobile-${mode}-390x844-context.png` });
    await page.keyboard.press("Escape");
    await expect(context).toBeHidden();
    await page.context().close();
  }
});

test("Pulse phone safe areas: the masthead clears the notch, the tabs clear the home indicator", async ({ browser }) => {
  for (const [size, insets] of [[{ width: 390, height: 844 }, { top: 47, bottom: 34, left: 0, right: 0 }], [{ width: 844, height: 390 }, { top: 0, bottom: 21, left: 47, right: 47 }]] as const) {
    const page = await phone(browser, "dark", size);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets } as never);
    } catch {
      test.info().annotations.push({ type: "skip", description: "This Chromium can't emulate safe-area insets" });
      await page.context().close();
      return;
    }
    await page.goto("/tambayan");
    const masthead = (await page.locator("#main-content [data-pulse-masthead]").boundingBox())!;
    expect(masthead.y).toBeGreaterThanOrEqual(insets.top);
    expect(masthead.x).toBeGreaterThanOrEqual(insets.left);
    expect(masthead.x + masthead.width).toBeLessThanOrEqual(size.width - insets.right + 0.5);
    if (size.width < 768) {
      const tabs = page.getByRole("navigation", { name: "Main destinations" });
      const pad = await tabs.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
      expect(pad).toBeGreaterThanOrEqual(insets.bottom);
      expect((await tabs.boundingBox())!.y + (await tabs.boundingBox())!.height).toBeLessThanOrEqual(size.height + 0.5); // no gap, no spill
      await page.screenshot({ path: "test-results/pulse-mobile-safe-area-portrait.png" });
    } else await page.screenshot({ path: "test-results/pulse-mobile-safe-area-landscape.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.context().close();
  }
});
