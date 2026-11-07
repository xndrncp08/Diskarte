import path from "node:path";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { channels, SERVER_ID } from "../fixtures/server";

// `npm run docs:screens`: real components with the harness's labelled sample data, saved as WebP for
// the Help Center. Skipped in normal runs.
test.skip(!process.env.DOCS_SCREENS, "set DOCS_SCREENS=1 (npm run docs:screens)");

const OUT = path.resolve(__dirname, "../../public/docs-assets/screens");
async function shot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await sharp(await page.screenshot()).webp({ quality: 78 }).toFile(path.join(OUT, `${name}.webp`));
}
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [], limited: false } }));
});

test("home, chat, voice, workspace and explore", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto("/tambayan");
  await shot(page, "home-desktop");
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  await expect(page.getByTestId("composer")).toBeVisible();
  await shot(page, "chat-desktop");
  await page.goto(`/tambayan/${SERVER_ID}/${channels[2].id}`);
  await expect(page.getByTestId("join-voice")).toBeVisible();
  await shot(page, "voice-lobby-desktop");
  await page.goto(`/tambayan/${SERVER_ID}/workspace`);
  await shot(page, "workspace-desktop");
  await page.goto("/tambayan/explore");
  await shot(page, "explore-desktop");
});

test("server settings", async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  await page.getByRole("button", { name: "Barkada HQ", exact: true }).click();
  await shot(page, "server-menu-desktop");
  await page.getByRole("menuitem", { name: "Server settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Server settings" })).toBeVisible();
  await shot(page, "server-settings-desktop");
});

test("phone screens and settings", async ({ page }) => {
  await page.setViewportSize(phone);
  await page.goto(`/tambayan/${SERVER_ID}/${channels[0].id}`);
  await expect(page.getByTestId("composer")).toBeVisible();
  await shot(page, "chat-mobile");
  await page.goto("/tambayan/messages");
  await shot(page, "messages-mobile");
  await page.goto("/tambayan");
  await page.getByRole("navigation", { name: "Main destinations" }).getByRole("button", { name: "Profile" }).click();
  const settings = page.getByRole("dialog", { name: "User settings" });
  await expect(settings).toBeVisible();
  for (const [tab, name] of [["Notifications", "settings-notifications-mobile"], ["Privacy & Safety", "settings-privacy-mobile"]] as const) {
    await settings.getByRole("tab", { name: tab }).click();
    await shot(page, name);
  }
});
