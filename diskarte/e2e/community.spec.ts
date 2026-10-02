import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, messageAction, messageItem, newUserPage, sendMessage } from "./helpers";

test.describe("community features", () => {
  test.skip(!FULL, FULL_REASON);

  test("threads, stickers, Bantay-Bayan auto-mod + audit log, and slow mode", async ({ browser }) => {
    const owner = await newUserPage(browser, "Kapitan");
    const serverName = `Bantay ${Date.now().toString(36)}`;
    await createServer(owner.page, serverName);
    const invite = await inviteLink(owner.page);
    const member = await newUserPage(browser, "Juan");
    await member.page.goto(invite);
    await member.page.getByRole("button", { name: "Join server" }).click();
    await expect(member.page.getByTestId("channel-title")).toHaveText("general");

    // Threads: the reply lives in the thread panel and the root shows a reply chip.
    await sendMessage(owner.page, "Thread: best lugaw sa QC?");
    await messageAction(owner.page, "Thread: best lugaw sa QC?", "Start thread");
    const thread = owner.page.getByRole("complementary", { name: "Thread" });
    await thread.getByTestId("composer").fill("Goto King sa Cubao!");
    await thread.getByTestId("composer").press("Enter");
    await expect(thread.getByTestId("message").filter({ hasText: "Goto King sa Cubao!" })).toBeVisible();
    await expect(messageItem(member.page, "Thread: best lugaw sa QC?").getByTestId("thread-chip")).toHaveText(/1 reply/);
    await expect(messageItem(member.page, "Goto King sa Cubao!")).toHaveCount(0); // not in the main channel
    await thread.getByRole("button", { name: "Close thread" }).click();

    // Stickers.
    await member.page.getByRole("button", { name: "Send a sticker" }).click();
    await member.page.getByRole("dialog", { name: "Stickers" }).getByRole("button", { name: "Sana All" }).click();
    await expect(owner.page.getByRole("img", { name: "Sticker: Sana All" })).toBeVisible();

    // Auto-mod drops phishing links from members and logs it for moderators.
    await sendMessage(member.page, "Libreng load! https://gcash-rewards.xyz/claim");
    await expect(member.page.getByText("Bantay-Bayan auto-mod blocked your message.")).toBeVisible();
    await expect(member.page.getByTestId("composer")).toHaveValue(/gcash-rewards/); // draft handed back
    await expect(messageItem(owner.page, "gcash-rewards")).toHaveCount(0);
    await owner.page.getByTestId("server-menu").click();
    await owner.page.getByRole("menuitem", { name: "Bantay-Bayan" }).click();
    const settings = owner.page.getByRole("dialog", { name: "Server settings" });
    await expect(settings.getByTestId("audit-log")).toContainText(`Bantay-Bayan blocked a message from ${member.user.displayName} (Phishing links)`);
    await expect(settings.getByTestId("audit-log")).toContainText(`${member.user.displayName} joined the server`);
    await owner.page.keyboard.press("Escape");

    // Slow mode: members wait between messages; the composer counts down. (10 s, and we let the
    // window pass first: the member's sticker above would otherwise count as their last message.)
    await member.page.getByTestId("composer").fill("");
    const general = owner.page.getByRole("navigation", { name: "Channels" }).getByRole("link", { name: "general" });
    await general.hover();
    await owner.page.getByRole("button", { name: "Edit general" }).click();
    const dialog = owner.page.getByRole("dialog", { name: "Edit channel" });
    await dialog.getByRole("radio", { name: "10s" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(member.page.getByTestId("slowmode-indicator")).toHaveText(/Slow mode 10s/);
    await member.page.waitForTimeout(10_500);
    await sendMessage(member.page, "una!");
    await expect(messageItem(owner.page, "una!")).toBeVisible();
    await expect(member.page.getByTestId("slowmode-indicator")).toHaveText(/Slow mode: \d+s/);
    await member.page.getByTestId("composer").fill("pangalawa");
    await expect(member.page.getByRole("button", { name: "Send message" })).toBeDisabled();

    await owner.context.close();
    await member.context.close();
  });

  test("LFG beacon: 1-click Join Party drops you into the voice channel", async ({ browser }) => {
    const owner = await newUserPage(browser, "Host");
    const serverUrl = await createServer(owner.page, `LFG ${Date.now().toString(36)}`);
    const invite = await inviteLink(owner.page);
    const player = await newUserPage(browser, "Player");
    await player.page.goto(invite);
    await player.page.getByRole("button", { name: "Join server" }).click();
    await expect(player.page.getByTestId("channel-title")).toHaveText("general");

    await owner.page.getByRole("link", { name: "LFG Board" }).click();
    await owner.page.getByTestId("new-beacon").click();
    const form = owner.page.getByRole("dialog", { name: "Magpa-LFG beacon" });
    await form.getByLabel("Laro").fill("Valorant");
    await form.getByLabel("Details (optional)").fill("Need 1 more, Gold+");
    await form.getByRole("button", { name: /I-broadcast/ }).click();
    const card = owner.page.getByTestId("lfg-beacon").filter({ hasText: "Valorant" });
    await expect(card.getByLabel("1 of 5 in party")).toBeVisible();

    await player.page.goto(`${serverUrl}/lfg`);
    await player.page.getByTestId("lfg-beacon").filter({ hasText: "Valorant" }).getByRole("button", { name: "Join Party" }).click();
    await expect(player.page.getByTestId("channel-title")).toHaveText("Tambayan 1");
    await expect(player.page.getByTestId("voice-stage")).toBeVisible({ timeout: 30_000 });
    await expect(card.getByLabel("2 of 5 in party")).toBeVisible();

    await owner.context.close();
    await player.context.close();
  });

  test("friends by @username and real-time direct messages", async ({ browser }) => {
    const a = await newUserPage(browser, "Ana");
    const b = await newUserPage(browser, "Ben");

    await a.page.goto("/tambayan/friends");
    await a.page.getByRole("tab", { name: "Add Friend" }).click();
    await a.page.getByLabel("Username").fill(`@${b.user.username}`);
    await a.page.getByRole("button", { name: "Send" }).click();
    await expect(a.page.getByText(`Friend request sent to @${b.user.username}.`)).toBeVisible();

    await b.page.goto("/tambayan/friends");
    await expect(b.page.getByRole("link", { name: /Friends/ })).toContainText("1");
    await b.page.getByRole("tab", { name: /Pending/ }).click();
    await b.page.getByTestId("friend-row").filter({ hasText: a.user.displayName }).getByRole("button", { name: "Accept" }).click();
    await b.page.getByRole("tab", { name: "All" }).click();
    await b.page.getByRole("button", { name: `Message ${a.user.displayName}` }).click();
    await expect(b.page.getByTestId("dm-title")).toHaveText(a.user.displayName);
    await sendMessage(b.page, "Uy! Laro tayo mamaya?");

    const dmLink = a.page.getByTestId("dm-list").getByRole("link", { name: new RegExp(b.user.displayName) });
    await expect(dmLink).toBeVisible();
    await dmLink.click();
    await expect(messageItem(a.page, "Uy! Laro tayo mamaya?")).toBeVisible();
    await sendMessage(a.page, "G! 9pm");
    await expect(messageItem(b.page, "G! 9pm")).toBeVisible();

    await a.context.close();
    await b.context.close();
  });
});
