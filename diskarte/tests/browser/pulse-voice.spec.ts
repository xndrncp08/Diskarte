import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { channels, SERVER_ID } from "../fixtures/server";
import { DM_ID } from "./pulse-messaging-data";

// Pulse voice (docs/design/pulse-voice.md): the lobby, the stage and the live strip on the fixture app. A call is faked
// with localStorage `fixture:call` (tests/browser/call.tsx; LiveKit's React bindings are stubbed by tests/browser/livekit.tsx).
const VOICE = `/tambayan/${SERVER_ID}/${channels.find((c) => c.type === "voice")!.id}`;
const TEXT = `/tambayan/${SERVER_ID}/${channels[1].id}`;

async function pulse(page: Page, mode: "dark" | "light", call: string | null) {
  await page.context().addCookies([{ name: "diskarte-shell", value: "pulse", url: "http://127.0.0.1:3130" }]);
  await page.addInitScript(([mode, call]) => {
    localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: mode }));
    if (call) localStorage.setItem("fixture:call", call);
  }, [mode, call] as const);
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
}

async function expectNoAxeViolations(page: Page) {
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => `${node.target.join(" ")}: ${node.html.slice(0, 140)} ${node.failureSummary ?? ""}`) }))).toEqual([]);
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function check(page: Page, shot: string) {
  expect(await noOverflow(page)).toBe(true);
  await expectNoAxeViolations(page);
  await page.screenshot({ path: `test-results/pulse-voice-${shot}.png` });
}

for (const mode of ["dark", "light"] as const) {
  for (const width of [390, 1280]) {
    test(`Pulse voice lobby, ${mode} at ${width}px`, async ({ page }) => {
      await pulse(page, mode, null);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(VOICE);
      await expect(page.getByTestId("voice-lobby")).toBeVisible();
      await expect(page.getByRole("button", { name: "Join" })).toBeVisible();
      await expect(page.getByLabel("Microphone")).toBeVisible();
      await check(page, `${mode}-${width}-lobby`);
    });

    test(`Pulse voice stage and live strip, ${mode} at ${width}px`, async ({ page }) => {
      await pulse(page, mode, "connected");
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(VOICE);
      const stage = page.getByTestId("pulse-voice-stage");
      await expect(stage).toBeVisible();
      await expect(stage.getByTestId("participant-card")).toHaveCount(3);
      await expect(stage.locator("[data-speaking]").first()).toBeVisible();
      await expect(stage.getByRole("button", { name: "Mute", exact: true })).toHaveAttribute("aria-pressed", "false");
      // The stage has its own dock: no live strip on it.
      await expect(page.getByRole("region", { name: "Live call" })).toHaveCount(0);
      await check(page, `${mode}-${width}-stage`);

      await stage.getByRole("button", { name: "Mute", exact: true }).click();
      await expect(stage.getByRole("button", { name: "Mute", exact: true })).toHaveAttribute("aria-pressed", "true");

      await page.goto(TEXT);
      await expect(page.getByTestId("message").first()).toBeVisible();
      const strip = page.getByTestId(width >= 768 ? "call-dock" : "call-strip-compact");
      await expect(strip).toBeVisible();
      await expect(strip.getByRole("link", { name: "Open stage" })).toBeVisible();
      await expect(page.getByTestId("call-announcer")).toHaveCount(1);
      await check(page, `${mode}-${width}-strip`);
      expect(errors).toEqual([]);
    });
  }

  test(`Pulse voice screen share and recovery, ${mode}`, async ({ page }) => {
    await pulse(page, mode, "share");
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(VOICE);
    await expect(page.getByTestId("screen-focus")).toBeVisible();
    await expect(page.getByRole("list", { name: "People in the call" }).getByTestId("participant-card")).toHaveCount(3);
    await check(page, `${mode}-1280-share`);
    // Exercise the iOS-style fallback without claiming a physical Safari check.
    await page.evaluate(() => Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: undefined, configurable: true }));
    await page.getByTestId("screen-focus").hover();
    await page.getByRole("button", { name: "Focus mode (fullscreen)" }).click();
    const focused = page.getByRole("dialog", { name: "Screen share" });
    await expect(focused).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Tab");
    expect(await focused.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await check(page, `${mode}-1280-focus-fallback`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Focus mode (fullscreen)" })).toBeFocused();

    await pulse(page, mode, "blocked");
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(VOICE);
    await expect(page.getByText("Call sound is off")).toBeVisible();
    await check(page, `${mode}-390-blocked`);
    await page.getByRole("button", { name: "Turn on sound" }).click();
    await expect(page.getByText("Call sound is off")).toHaveCount(0);
  });
}

test.describe("Pulse mobile DM calls", () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    test(`keeps the transcript and composer usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await pulse(page, "dark", "dm");
      await page.setViewportSize(viewport);
      await page.goto(`/tambayan/dm/${DM_ID}`);
      await expect(page.getByTestId("dm-call")).toBeVisible();
      await expect(page.getByTestId("pulse-voice-stage")).toBeVisible();
      const composer = page.getByTestId("composer");
      await expect(composer).toBeInViewport();
      const log = page.getByTestId("message-list");
      expect((await log.boundingBox())!.height).toBeGreaterThanOrEqual(80);
      await check(page, `dark-${viewport.width}-dm-call`);
    });
  }
});

test("Open stage and back keeps the transcript where you left it", async ({ page }) => {
  await pulse(page, "dark", "connected");
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto(TEXT);
  const log = page.locator("[data-testid=message]").first();
  await expect(log).toBeVisible();
  // What you were looking at: the first message showing at the top of the log and how far down it sits. Not raw scrollTop:
  // the New line above it is gone on return (the room was read). The fixture navigates in place, so this helper survives.
  await page.evaluate(() => {
    Object.assign(window, {
      firstShown() {
        const el = document.querySelector<HTMLElement>("[data-testid=message-list]")!;
        const top = el.getBoundingClientRect().top;
        const row = Array.from(el.querySelectorAll<HTMLElement>("[data-testid=message]")).find((m) => m.getBoundingClientRect().bottom > top + 1)!;
        return { id: row.id, at: Math.round(row.getBoundingClientRect().top - top) };
      },
    });
  });
  const shown = () => page.evaluate(() => (window as unknown as { firstShown: () => { id: string; at: number } }).firstShown());
  // A little above the newest message, so "where you left it" isn't simply the bottom.
  await page.getByTestId("message-list").evaluate((el) => (el.scrollTop = el.scrollHeight - el.clientHeight - 150));
  await page.waitForTimeout(100);
  const before = await shown();
  await page.getByRole("region", { name: "Live call" }).getByRole("link", { name: "Open stage" }).click();
  await expect(page.getByTestId("pulse-voice-stage")).toBeVisible();
  await page.goBack();
  await expect(log).toBeVisible();
  // Same message on top; it may sit up to the New line's height higher, since that line is gone once the room is read.
  await expect.poll(async () => (await shown()).id).toBe(before.id);
  expect(Math.abs((await shown()).at - before.at)).toBeLessThanOrEqual(48);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`Pulse stage remains usable while reconnecting at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await pulse(page, "dark", "reconnecting");
    await page.setViewportSize(viewport);
    await page.goto(VOICE);
    const stage = page.getByTestId("pulse-voice-stage");
    await expect(stage.getByText("Reconnecting…")).toBeVisible();
    const leave = stage.getByRole("button", { name: "Leave", exact: true });
    await leave.scrollIntoViewIfNeeded();
    await expect(leave).toBeInViewport();
    await check(page, `dark-${viewport.width}-reconnecting`);
  });
}
