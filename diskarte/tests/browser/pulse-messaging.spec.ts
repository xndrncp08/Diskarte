import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { channels, SERVER_ID } from "../fixtures/server";
import { DM_ID } from "./pulse-messaging-data";

// Pulse messaging (docs/design/pulse-messaging.md): the margin transcript, compose dock, DM, forum and thread
// on the fixture app (#chika has read and unread messages, a mention, code, a reply, reactions and a thread).
const CHANNEL = `/tambayan/${SERVER_ID}/${channels[1].id}`;
const ROUTES: [string, string][] = [
  ["channel", CHANNEL],
  ["dm", `/tambayan/dm/${DM_ID}`],
  ["forum", `/tambayan/${SERVER_ID}/forum`],
];

async function pulse(page: Page, mode: "dark" | "light") {
  await page.context().addCookies([{ name: "diskarte-shell", value: "pulse", url: "http://127.0.0.1:3130" }]);
  await page.addInitScript((mode) => localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: mode })), mode);
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
}

async function expectNoAxeViolations(page: Page) {
  // Reduced motion still fades opacity (framer-motion), so wait until every overlay is fully opaque.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[role=dialog],[role=menu],[data-testid=thread-panel]")).every((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) if (getComputedStyle(node).opacity !== "1") return false;
      return true;
    }),
  );
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => `${node.target.join(" ")}: ${node.html.slice(0, 140)} ${node.failureSummary ?? ""}`) }))).toEqual([]);
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const mode of ["dark", "light"] as const) {
  for (const width of [390, 1280]) {
    test(`Pulse messaging, ${mode} at ${width}px: accessible, no overflow`, async ({ page }) => {
      await pulse(page, mode);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const [name, route] of ROUTES) {
        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-shell", "pulse");
        await expect(page.locator("#main-content").getByRole("heading", { level: 1 }).first()).toBeVisible();
        if (name !== "forum") await expect(page.getByTestId("message").first()).toBeVisible();
        expect(await noOverflow(page)).toBe(true);
        await expectNoAxeViolations(page);
        await page.screenshot({ path: `test-results/pulse-messaging-${mode}-${width}-${name}.png` });
      }

      // The channel: the New line above the first unread, the margin, the dock; then the thread.
      await page.goto(CHANNEL);
      await expect(page.getByRole("separator", { name: /^New · / })).toBeVisible();
      await expect(page.locator("#message-r5")).toHaveAttribute("data-grouped", "true");
      await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
      await page.getByTestId("thread-chip").click();
      const thread = page.getByTestId("thread-panel");
      await expect(thread.getByText("I'll bring the speaker.")).toBeVisible();
      expect(await noOverflow(page)).toBe(true);
      await expectNoAxeViolations(page);
      await page.screenshot({ path: `test-results/pulse-messaging-${mode}-${width}-thread.png` });

      // The DM: "Seen" in words under my last message.
      await page.goto(`/tambayan/dm/${DM_ID}`);
      await expect(page.getByTestId("read-receipt")).toHaveText(/Seen/);
      expect(errors).toEqual([]);
    });
  }
}

test("Pulse message log: one Tab stop, arrows, the action row and back out", async ({ page }) => {
  await pulse(page, "dark");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(CHANNEL);
  const rows = page.getByTestId("message");
  await expect(rows.last()).toBeVisible();

  // Tab from the page into the log lands on the newest message, and only that one.
  await page.locator("#main-content").focus();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => Boolean((document.activeElement as HTMLElement | null)?.dataset.messageId))) break;
  }
  await expect(page.locator("#message-r6")).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#message-r5")).toBeFocused();
  // Enter goes into the inline action row (visible while the message has keyboard focus).
  await page.keyboard.press("Enter");
  const actions = page.locator("#message-r5").getByRole("toolbar", { name: "Message actions" });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("button", { name: "Reply" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(actions.getByRole("button", { name: "React" })).toBeFocused();
  await expectNoAxeViolations(page);
  await page.screenshot({ path: "test-results/pulse-messaging-dark-1280-keyboard.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#message-r5")).toBeFocused();

  // Tab on a message leaves the log in one step.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !document.querySelector("[data-testid=message-list]")?.contains(document.activeElement))).toBe(true);

  // More… opens the message menu (before the reply below: the log re-settling at the bottom closes open menus).
  await page.locator("#message-r6").hover();
  await page.locator("#message-r6").getByRole("button", { name: "More…" }).click();
  await expect(page.getByRole("menu", { name: "Message options" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Message options" })).toBeHidden();

  // Reply from the action row: the ticket stub sits on the dock, Escape in the field cancels it.
  await page.locator("#message-r4").hover();
  await page.locator("#message-r4").getByRole("button", { name: "Reply" }).click();
  await expect(page.locator("[data-reply-stub]").last()).toContainText("Replying to Juan");
  await expect(page.getByTestId("composer")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Replying to Juan")).toBeHidden();
});
