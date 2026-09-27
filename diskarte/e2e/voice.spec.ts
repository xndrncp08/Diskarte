import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, makeUser, newUserPage, signUpAndOnboard } from "./helpers";

test.describe("WebRTC voice rooms", () => {
  test.skip(!FULL, FULL_REASON);

  test("join a voice channel, see each other, mute, browse away and disconnect", async ({ page, browser }) => {
    const host = makeUser("Host");
    await signUpAndOnboard(page, host);
    await createServer(page, `Voice ${Date.now().toString(36)}`);
    const invite = await inviteLink(page);

    const channels = page.getByRole("navigation", { name: "Channels" });
    await channels.getByRole("link", { name: "Tambayan 1" }).click();
    await page.getByTestId("join-voice").click();

    const dock = page.getByTestId("call-dock");
    await expect(dock).toContainText("Voice Connected", { timeout: 30_000 });
    await expect(page.getByTestId("voice-stage")).toBeVisible();
    await expect(page.getByTestId("participant-tile").filter({ hasText: "(ikaw)" })).toBeVisible();

    // A friend joins the same room.
    const friend = await newUserPage(browser, "Guest");
    await friend.page.goto(invite);
    await friend.page.getByRole("button", { name: "Sumali sa tambayan" }).click();
    await friend.page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "Tambayan 1" }).click();
    await expect(friend.page.getByText(/1 ang nasa loob ngayon/)).toBeVisible();
    await friend.page.getByTestId("join-voice").click();
    await expect(friend.page.getByTestId("call-dock")).toContainText("Voice Connected", { timeout: 30_000 });

    await expect(page.getByTestId("participant-tile")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByRole("list", { name: "Nasa voice channel" })).toContainText(friend.user.displayName);

    // Mute via the stage controls.
    await page.getByTestId("voice-stage").getByRole("button", { name: "Mute" }).click();
    await expect(page.getByTestId("voice-stage").getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");

    // Browsing a text channel keeps the call alive in the floating dock.
    await channels.getByRole("link", { name: "general" }).click();
    await expect(page.getByTestId("channel-title")).toHaveText("general");
    await expect(dock).toContainText("Voice Connected");
    await expect(dock).toContainText("Tambayan 1");

    await dock.getByRole("button", { name: "Disconnect" }).click();
    await expect(dock).toHaveCount(0);
    await friend.context.close();
  });
});
