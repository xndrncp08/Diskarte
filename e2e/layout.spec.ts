import { expect, test, type Locator, type Page } from "@playwright/test";
import { createServer, FULL, FULL_REASON, makeUser, messageItem, sendMessage, signUpAndOnboard } from "./helpers";

/**
 * Real-geometry regression checks for overlays (menus, pickers, popovers, modals, call dock).
 * Complements tests/components/IsolatedComponents.test.tsx, which can't measure layout in jsdom.
 */

async function columnBoxes(page: Page) {
  const rail = await page.getByRole("navigation", { name: "Servers" }).boundingBox();
  const sidebar = await page.getByRole("complementary", { name: /channels$/ }).boundingBox();
  const canvas = await page.getByTestId("message-list").boundingBox();
  return { rail, sidebar, canvas };
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return {
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
      bodyX: document.body.scrollWidth - document.body.clientWidth,
    };
  });
  expect(overflow.x, "horizontal page overflow").toBeLessThanOrEqual(0);
  expect(overflow.y, "vertical page overflow").toBeLessThanOrEqual(0);
  expect(overflow.bodyX, "body horizontal overflow").toBeLessThanOrEqual(0);
}

/** Fully inside the viewport and actually painted on top (not clipped or covered). */
async function expectFullyVisible(page: Page, overlay: Locator) {
  const box = await overlay.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  const onTop = await overlay.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const points = [
      [r.left + 6, r.top + 6],
      [r.right - 6, r.top + 6],
      [r.left + 6, r.bottom - 6],
      [r.right - 6, r.bottom - 6],
      [r.left + r.width / 2, r.top + r.height / 2],
    ];
    return points.every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
  });
  expect(onTop, "overlay is clipped or covered").toBe(true);
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe("overlay layout regression", () => {
  test.skip(!FULL, FULL_REASON);
  test.use({ viewport: { width: 1280, height: 720 } });

  test("menus, pickers, popovers and modals never shift columns or overflow", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("Layout"));
    await createServer(page, `Layout ${Date.now().toString(36)}`);
    // The DB allows 8 messages / 10 s per user, so use 7 tall messages to get a scrolling list.
    for (let i = 0; i < 7; i++) await sendMessage(page, `Filler message ${i}\npara\nmay\nscroll\ndito`);
    await expect(messageItem(page, "Filler message 6")).toBeVisible();
    await expect(page.getByTestId("message").filter({ hasText: "Hindi na-send" })).toHaveCount(0);
    const before = await columnBoxes(page);
    await expectNoPageOverflow(page);

    // Server options dropdown.
    await page.getByTestId("server-menu").click();
    const serverMenu = page.getByRole("menu", { name: "Server menu" });
    await expectFullyVisible(page, serverMenu);
    expect(await columnBoxes(page)).toEqual(before);
    await expectNoPageOverflow(page);
    await page.keyboard.press("Escape");
    await expect(serverMenu).toHaveCount(0);
    await expect(page.getByTestId("server-menu")).toBeFocused();

    // Status menu at the bottom of the sidebar opens upward, fully on screen.
    await page.getByTestId("user-panel").getByRole("button", { name: /Set status/ }).click();
    const statusMenu = page.getByRole("menu", { name: "Set status" });
    await expect(statusMenu).toHaveAttribute("data-side", "top");
    await expectFullyVisible(page, statusMenu);
    await page.mouse.click(700, 300); // outside click
    await expect(statusMenu).toHaveCount(0);

    // Reaction picker from the hover toolbar on the last (bottom-most) message flips upward.
    const last = messageItem(page, "Filler message 6");
    await last.hover();
    await last.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name: "Add reaction" }).click();
    const picker = page.getByRole("dialog", { name: "Emoji picker" });
    await expectFullyVisible(page, picker);
    expect(await columnBoxes(page)).toEqual(before);
    await expectNoPageOverflow(page);
    await page.keyboard.press("Escape");

    // Same picker for the top-most visible message opens downward.
    await page.getByTestId("message-list").evaluate((el) => (el.scrollTop = 0));
    const first = messageItem(page, "Filler message 0");
    await first.hover();
    await first.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name: "Add reaction" }).click();
    await expectFullyVisible(page, picker);
    await page.keyboard.press("Escape");

    // Composer emoji picker escapes the composer's rounded card.
    await page.getByRole("button", { name: "Insert emoji" }).click();
    await expect(picker).toHaveAttribute("data-side", "top");
    await expectFullyVisible(page, picker);
    await page.keyboard.press("Escape");

    // Member popover escapes the member list's scroll box.
    await page.getByTestId("member-row").first().click();
    const popover = page.getByRole("dialog", { name: /'s profile$/ });
    await expectFullyVisible(page, popover);
    await page.keyboard.press("Escape");

    // Create-server modal locks page scroll and restores it.
    await page.getByRole("button", { name: "Add a server" }).click();
    const modal = page.getByRole("dialog", { name: "Gumawa ng Tambayan" });
    await expectFullyVisible(page, modal);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await columnBoxes(page)).toEqual(before);
  });

  test("the call dock sits above the user panel without covering it or moving the channel list", async ({ page }) => {
    await signUpAndOnboard(page, makeUser("Dock"));
    await createServer(page, `Dock ${Date.now().toString(36)}`);
    const channels = page.getByRole("navigation", { name: "Channels" });
    const generalBefore = await channels.getByRole("link", { name: "general" }).boundingBox();

    await channels.getByRole("link", { name: "Tambayan 1" }).click();
    await page.getByTestId("join-voice").click();
    const dock = page.getByTestId("call-dock");
    await expect(dock).toContainText("Voice Connected", { timeout: 30_000 });
    await channels.getByRole("link", { name: "general" }).click();
    await expect(page.getByTestId("channel-title")).toHaveText("general");

    const dockBox = (await dock.boundingBox())!;
    const panelBox = (await page.getByTestId("user-panel").boundingBox())!;
    expect(intersects(dockBox, panelBox), "dock overlaps the user panel").toBe(false);
    expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(panelBox.y);
    expect(await channels.getByRole("link", { name: "general" }).boundingBox()).toEqual(generalBefore);
    await expectFullyVisible(page, dock);
    await expectFullyVisible(page, page.getByTestId("user-panel"));
    await expectNoPageOverflow(page);
    await dock.getByRole("button", { name: "Disconnect" }).click();
  });

  test("mobile drawer menus stay on screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await signUpAndOnboard(page, makeUser("Mobile"));
    await createServer(page, `Mobile ${Date.now().toString(36)}`);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByTestId("server-menu").click();
    await expectFullyVisible(page, page.getByRole("menu", { name: "Server menu" }));
    await expectNoPageOverflow(page);
  });
});
