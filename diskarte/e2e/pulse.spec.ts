import { expect, test, type Page } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, makeUser, messageItem, newUserPage, sendMessage, signUpAndOnboard } from "./helpers";

// Pulse backend acceptance: real Supabase + LiveKit, with the server running the public opt-in rollout
// (DISKARTE_PULSE_ROLLOUT=opt-in, set by CI) exactly as production will. The second account never opts
// in, so every step also checks Classic ↔ Pulse interoperability and that Classic stays the default.
const ROLLOUT = process.env.DISKARTE_PULSE_ROLLOUT === "opt-in";

const shell = (page: Page) => page.locator("html");

test.describe("Pulse public opt-in", () => {
  test.skip(!FULL, FULL_REASON);
  test.skip(!ROLLOUT, "needs DISKARTE_PULSE_ROLLOUT=opt-in on the server (CI sets it)");

  test("opt in, chat, get notified, call, browse on a phone and return to Classic", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const owner = makeUser("Pulse");
    await signUpAndOnboard(page, owner);
    await expect(shell(page)).toHaveAttribute("data-shell", "classic"); // Classic is the default
    const serverName = `E2E Pulse ${Date.now().toString(36)}`;
    const serverUrl = await createServer(page, serverName);
    const invite = await inviteLink(page);

    const friend = await newUserPage(browser, "Kasama");
    await friend.page.goto(invite);
    await friend.page.getByRole("button", { name: "Join server" }).click();
    await expect(friend.page.getByTestId("channel-title")).toHaveText("general");

    // Opt in from Settings → Appearance; the server renders Pulse from then on, including after a reload.
    await page.getByTestId("user-panel").getByRole("link", { name: "User settings" }).click();
    const settings = page.getByRole("dialog", { name: "User settings" });
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("switch", { name: "Try the new Diskarte" }).click();
    await expect(shell(page)).toHaveAttribute("data-shell", "pulse");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await expect(shell(page)).toHaveAttribute("data-shell", "pulse");

    // Keyboard: the first Tab reaches the skip link.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

    // Pulse-only destinations work for the opted-in account; the other account stays on Classic.
    await page.goto("/tambayan/spaces");
    await page.getByRole("list", { name: "Your Spaces" }).getByRole("link", { name: new RegExp(serverName) }).click();
    const rooms = page.getByTestId("pulse-rooms");
    await expect(rooms).toBeVisible();
    await friend.page.goto("/tambayan/spaces");
    await expect(friend.page).toHaveURL(/\/tambayan$/);
    await expect(shell(friend.page)).toHaveAttribute("data-shell", "classic");

    // Real-time messaging both ways between Pulse and Classic.
    await rooms.getByRole("link", { name: /^general/ }).click();
    await sendMessage(page, "Galing ng Pulse");
    await friend.page.goto(serverUrl);
    await expect(messageItem(friend.page, "Galing ng Pulse")).toBeVisible();
    await sendMessage(friend.page, "Kita ko sa Classic");
    await expect(messageItem(page, "Kita ko sa Classic")).toBeVisible();

    // A mention in another room reaches the Pulse navigator.
    await friend.page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "chika" }).click();
    await expect(friend.page.getByTestId("channel-title")).toHaveText("chika");
    await sendMessage(friend.page, `@${owner.username} tingnan mo`);
    const mentioned = rooms.getByRole("link", { name: /chika.*1 mention/ });
    await expect(mentioned).toBeVisible({ timeout: 40_000 });
    await mentioned.click();
    await expect(messageItem(page, "tingnan mo")).toBeVisible();
    await expect(rooms.getByRole("link", { name: /chika.*mention/ })).toHaveCount(0);

    // Voice: join from Pulse, keep the call while browsing, and keep it across the switch back.
    await rooms.getByRole("link", { name: /^Tambayan 1/ }).click();
    await page.getByTestId("voice-lobby").getByRole("button", { name: "Join" }).click();
    const stage = page.getByTestId("pulse-voice-stage");
    await expect(stage.getByTestId("participant-card")).toHaveCount(1, { timeout: 30_000 });
    await stage.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(stage.getByRole("button", { name: "Mute", exact: true })).toHaveAttribute("aria-pressed", "true");
    await rooms.getByRole("link", { name: /^general/ }).click();
    await expect(page.getByRole("region", { name: "Live call" })).toBeVisible();

    // Phone layout: a room fills the screen; Back reaches the Space landing, where the main destinations
    // replace the desktop navigator (in-app navigation keeps the call).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Back" }).click();
    const tabs = page.getByRole("navigation", { name: "Main destinations" });
    await expect(tabs.getByRole("link", { name: "Spaces" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Live call" })).toBeVisible();
    await tabs.getByRole("link", { name: "Spaces" }).click();
    await expect(tabs.getByRole("link", { name: "Spaces" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("list", { name: "Your Spaces" }).getByRole("link", { name: new RegExp(serverName) }).click();
    await page.setViewportSize({ width: 1280, height: 720 });
    await rooms.getByRole("link", { name: /^general/ }).click();
    await expect(page.getByRole("region", { name: "Live call" })).toBeVisible();

    // Back to Classic from the You menu: the call survives, and the choice persists.
    await page.getByTestId("you-button").click();
    await page.getByRole("menuitem", { name: "Back to Classic" }).click();
    await expect(shell(page)).toHaveAttribute("data-shell", "classic");
    await expect(page.getByTestId("call-dock")).toContainText("Voice Connected");
    await page.goto(serverUrl);
    await expect(shell(page)).toHaveAttribute("data-shell", "classic");
    await expect(page.getByTestId("channel-title")).toHaveText("general");
    await expect(messageItem(page, "Kita ko sa Classic")).toBeVisible();
    await friend.context.close();
  });
});
