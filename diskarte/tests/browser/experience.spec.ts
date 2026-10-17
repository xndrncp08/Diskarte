import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { channels, SERVER_ID } from "../fixtures/server";

// Real application components with an in-memory data boundary, not backend E2E coverage.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/voice-preview?**", (route) =>
    route.fulfill({
      json: {
        channels: [
          {
            id: channels[2].id,
            name: channels[2].name,
            count: 2,
            participants: [],
          },
        ],
      },
    }),
  );
});

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`signed-in surfaces at ${width}px stay usable without overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of [
      "/tambayan",
      `/tambayan/${SERVER_ID}/${channels[0].id}`,
      `/tambayan/${SERVER_ID}/workspace`,
      "/tambayan/explore",
      "/tambayan/friends",
      `/tambayan/${SERVER_ID}/${channels[2].id}`,
    ]) {
      await page.goto(route);
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(
        page
          .locator("#main-content")
          .getByRole("heading", { level: 1 })
          .first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
      await expect(page.locator("canvas")).toHaveCount(0);
      if (width === 390 || width === 1440) await page.screenshot({ path: `test-results/surface-${route.split("/").pop()}-${width}.png` });
      if (route.endsWith(channels[0].id)) {
        const composer = page.getByTestId("composer");
        await composer.fill("An unsent message, kept in the composer.");
        await expect(composer).toBeInViewport();
        await expect(composer).toHaveValue(
          "An unsent message, kept in the composer.",
        );
        if (width < 768) {
          await page.setViewportSize({ width, height: 520 });
          await expect(composer).toBeInViewport();
          expect(
            (await composer.boundingBox())!.y +
              (await composer.boundingBox())!.height,
          ).toBeLessThanOrEqual(520);
          await page.setViewportSize({ width, height: 900 });
        }
      }
    }
    expect(errors).toEqual([]);
    await page.goto("/tambayan");
    await page.screenshot({ path: `test-results/home-${width}.png` });
    if (width < 768) {
      await expect(
        page.getByRole("navigation", { name: "Main destinations" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        page.getByRole("button", { name: "Close navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Open navigation" }),
      ).toBeFocused();
    }
  });
}

for (const mode of ["dark", "light"] as const) {
  test(`${mode} connected surfaces pass automated accessibility checks`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const route of [
      "/tambayan",
      `/tambayan/${SERVER_ID}/${channels[0].id}`,
      `/tambayan/${SERVER_ID}/workspace`,
        "/tambayan/friends", "/tambayan/messages", "/tambayan/explore",
    ]) {
      await page.goto(route);
      await expect(page.locator("#main-content")).toBeVisible();
      await page.evaluate((mode) => {
        document.documentElement.dataset.colorMode = mode;
      }, mode);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        })),
      ).toEqual([]);
    }
  });
}

test("settings search, keyboard navigation and workspace filters work on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tambayan");
  await page
    .getByRole("navigation", { name: "Main destinations" })
    .getByRole("button", { name: "Profile" })
    .click();
  const settings = page.getByRole("dialog", { name: "User settings" });
  await expect(settings).toBeVisible();
  await settings
    .getByRole("searchbox", { name: "Find a settings section" })
    .fill("devices");
  const devices = settings.getByRole("tab", { name: "Devices & Sessions" });
  await page.keyboard.press("Tab");
  await expect(devices).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    settings.getByRole("button", { name: "Sign out everywhere" }),
  ).toBeVisible();
  await settings.getByRole("searchbox").fill("keybinds");
  await settings.getByRole("tab", { name: "Keybinds" }).click();
  await expect(settings.getByRole("tabpanel")).toContainText("Ctrl / Cmd + K");
  await page.screenshot({ path: "test-results/settings-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await page.goto(`/tambayan/${SERVER_ID}/workspace`);
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("board");
  await expect(page.getByRole("status")).toContainText("No items of this type");
  await page
    .getByRole("combobox", { name: "Show", exact: true })
    .selectOption("note");
  await page.getByRole("button", { name: /Weekend plans/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(async () => (await page.getByRole("dialog").boundingBox())!.height).toBeGreaterThanOrEqual(842);
  await expect(page.getByLabel("Note (Markdown supported)")).toHaveValue(
    "Bring your ideas. We’ll make a plan together.",
  );
});


test("conversation filters and friend search use the existing account data", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tambayan/messages");
  const list = page.getByTestId("messages-list");
  await expect(list.getByRole("link", { name: /Maria/ })).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unread", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "Search conversations" }).fill("not-a-person");
  await expect(list).toContainText("No conversations match.");
  await page.getByRole("searchbox", { name: "Search conversations" }).clear();
  await expect(list).toContainText("Maria");
  await page.goto("/tambayan/friends");
  await page.getByRole("searchbox", { name: "Search friends" }).fill("not-a-person");
  await expect(page.getByRole("tabpanel")).toContainText("No friends match your search.");
  await page.getByRole("searchbox", { name: "Search friends" }).fill("maria");
  await expect(page.getByTestId("friend-row")).toHaveCount(1);
  await page.getByRole("tab", { name: "All", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Pending/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Juan");
});

test("community administration keeps permission-aware sections and keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  await page.getByRole("button", { name: "Barkada HQ", exact: true }).click();
  await page.getByRole("menuitem", { name: "Server settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Server settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("tab", { name: "Roles", exact: true })).toBeFocused();
  await expect(dialog.getByRole("tab", { name: "Roles", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(dialog.getByRole("tab", { name: "Overview", exact: true })).toBeFocused();
  await page.screenshot({ path: "test-results/community-settings-desktop.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("floating workspace moves and resizes without losing the composer, then recomposes on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  const composer = page.getByTestId("composer");
  await composer.fill("Keep this draft while arranging my workspace.");
  const floating = page.getByRole("button", { name: "Floating workspace", exact: true });
  await floating.click();
  await expect(page.locator("[data-floating-panel]")).toHaveCount(2);
  const nav = page.getByRole("region", { name: "Channels", exact: true });
  const before = (await nav.boundingBox())!;
  await page.getByRole("button", { name: "Move Channels", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await nav.boundingBox())!.x).toBeGreaterThan(before.x);
  await page.getByRole("button", { name: "Resize Channels window", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await nav.boundingBox())!.width).toBe(before.width + 16);
  await expect(composer).toHaveValue("Keep this draft while arranging my workspace.");
  await page.screenshot({ path: "test-results/floating-workspace-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-floating-panel]")).toHaveCount(0);
  await expect(composer).toBeInViewport();
  await expect(composer).toHaveValue("Keep this draft while arranging my workspace.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("[data-floating-panel]")).toHaveCount(2);
  await floating.click();
  await expect(page.locator("[data-floating-panel]")).toHaveCount(0);
  await expect(composer).toHaveValue("Keep this draft while arranging my workspace.");
});
