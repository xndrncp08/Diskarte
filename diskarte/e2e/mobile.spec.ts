import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { createServer, FULL, FULL_REASON, makeUser, signUpAndOnboard } from "./helpers";

test.use({ ...devices["Pixel 7"], permissions: ["microphone", "camera"] });

/** Transient toasts legitimately sit on top of the UI for a few seconds; let them clear first. */
async function waitForToasts(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
}

/** Checks the *tappable* area (including touch-target pseudo-elements) is at least 44×44 px. */
async function expectTouchTarget(locator: Locator) {
  const ok = await locator.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" }); // elementFromPoint only sees the viewport
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hits = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (el === hit || el.contains(hit));
    };
    return hits(cx - 21.5, cy) && hits(cx + 21.5, cy) && hits(cx, cy - 21.5) && hits(cx, cy + 21.5);
  });
  expect(ok, `tap target too small: ${await locator.evaluate((el) => el.outerHTML.slice(0, 120))}`).toBe(true);
}

async function expectAllTouchTargets(page: Page, scope: Locator) {
  const controls = scope.locator("button:visible, a:visible, input:visible:not([type=hidden]), textarea:visible");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await expectTouchTarget(controls.nth(i));
}

async function expectFitsViewport(page: Page) {
  const fit = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vh: getComputedStyle(document.querySelector("main") ?? document.body).height,
  }));
  expect(fit.x).toBeLessThanOrEqual(0);
}

test.describe("mobile — public pages", () => {
  for (const path of ["/login", "/signup"]) {
    test(`${path}: every control is a 44px touch target and nothing overflows`, async ({ page }) => {
      await page.goto(path);
      await expectAllTouchTargets(page, page.locator("main"));
      await expectFitsViewport(page);
    });
  }
});

test.describe("mobile — app shell", () => {
  test.skip(!FULL, FULL_REASON);

  test("toasts appear at the top on phones, clear of the composer", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("Toast"));
    await createServer(page, `Toast ${Date.now().toString(36)}`); // shows a success toast
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    const toastBox = (await toast.boundingBox())!;
    const composerBox = (await page.getByTestId("composer").boundingBox())!;
    expect(toastBox.y + toastBox.height).toBeLessThan(composerBox.y);
    expect(toastBox.y).toBeLessThan(page.viewportSize()!.height / 2);
  });

  test("swipe opens the navigation drawer; chat controls are touch-sized and above the fold", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("Phone"));
    await createServer(page, `Phone ${Date.now().toString(36)}`);
    const viewport = page.viewportSize()!;
    await waitForToasts(page);

    // The composer sits fully inside the dynamic viewport (100dvh), not under the URL bar.
    const composer = await page.getByTestId("composer").boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(viewport.height);
    for (const name of ["Attach files", "Insert emoji", "Open navigation", "Pinned messages"]) {
      await expectTouchTarget(page.locator(`button[aria-label="${name}"]:visible`).first());
    }

    // Edge swipe → drawer.
    await page.touchscreen.tap(5, viewport.height / 2);
    await page.evaluate(({ h }) => {
      const shell = document.querySelector('[data-testid="shell"]')!;
      const touch = (x: number) => new Touch({ identifier: 1, target: shell, clientX: x, clientY: h / 2 });
      shell.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(8)], bubbles: true }));
      shell.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(120)], bubbles: true }));
      shell.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
    }, { h: viewport.height });
    const channels = page.getByRole("navigation", { name: "Channels" });
    await expect(channels.getByRole("link", { name: "general" })).toBeInViewport();
    // Let the drawer finish sliding in: mid-transition, probe points can sit off-screen (x < 0).
    await expect.poll(async () => (await channels.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(72);
    await expectTouchTarget(channels.getByRole("link", { name: "chika" }));
    await expectTouchTarget(page.getByTestId("server-menu"));
    await expectTouchTarget(page.getByRole("button", { name: "Sound settings" }));

    // Swipe back to close.
    await page.evaluate(({ h }) => {
      const shell = document.querySelector('[data-testid="shell"]')!;
      const touch = (x: number) => new Touch({ identifier: 2, target: shell, clientX: x, clientY: h / 2 });
      shell.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(300)], bubbles: true }));
      shell.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(150)], bubbles: true }));
      shell.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
    }, { h: viewport.height });
    await expect(page.getByRole("button", { name: "Close navigation" })).toHaveCount(0);

    // Tapping a message reveals its actions (no hover on phones).
    await page.getByTestId("composer").fill("Tap me");
    await page.getByTestId("composer").press("Enter");
    const message = page.getByTestId("message").filter({ hasText: "Tap me" });
    await message.locator("p").first().tap();
    await expect(message).toHaveAttribute("data-active", "true");
    // The toolbar scales in from 95 %; probe once it has settled at full size.
    await expect(message.getByRole("toolbar", { name: "Message actions" })).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expectTouchTarget(message.getByRole("button", { name: "Reply" }));
  });

  test("call controls in the dock are touch-sized", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("Caller"));
    await createServer(page, `Caller ${Date.now().toString(36)}`);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Tambayan 1" }).click();
    await page.getByTestId("join-voice").click();
    await expect(page.getByTestId("voice-stage")).toBeVisible({ timeout: 30_000 });
    await waitForToasts(page);
    const bar = page.getByTestId("voice-stage").getByRole("toolbar", { name: "Call controls" });
    const box = (await bar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const name of ["Mute", "Deafen", "Turn on camera", "Share screen", "Disconnect"]) await expectTouchTarget(bar.getByRole("button", { name }));
    await page.getByTestId("voice-stage").getByRole("button", { name: "Disconnect" }).click();
  });
});
