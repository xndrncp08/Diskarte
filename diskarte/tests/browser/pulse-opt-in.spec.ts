import { expect, test } from "@playwright/test";
import { channels, SERVER_ID } from "../fixtures/server";

// Real components and browser storage; backend authorization and LiveKit acceptance remain separate gates.
test("public opt-in preserves the draft, attachment, call controls and appearance when returning to Classic", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem("fixture:call", "connected");
    localStorage.setItem("diskarte:display-prefs", JSON.stringify({ colorMode: "light", fontSize: 18 }));
  });
  await page.route("**/api/voice-preview?**", (route) => route.fulfill({ json: { channels: [] } }));
  const path = `/tambayan/${SERVER_ID}/${channels[1].id}`;
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-shell", "classic");
  await page.getByTestId("composer").fill("Keep my unsent message");
  await page.locator('input[type="file"]').setInputFiles({ name: "voice.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3 fixture recording") });
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await expect(page.getByText("voice.mp3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.getByRole("link", { name: "User settings", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "User settings" });
  await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
  const toggle = settings.getByRole("switch", { name: "Try the new Diskarte" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-shell", "pulse");
  await expect(toggle).toBeChecked();
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("composer")).toHaveValue("Keep my unsent message");
  await expect(page.getByText("voice.mp3", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live call" }).getByRole("button", { name: "Mute", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("you-button").click();
  await page.getByRole("menuitem", { name: "Back to Classic" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-shell", "classic");
  await expect(page.getByTestId("composer")).toHaveValue("Keep my unsent message");
  await expect(page.getByText("voice.mp3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  await expect(page).toHaveURL(path);
});
