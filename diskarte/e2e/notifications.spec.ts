import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, messageItem, newUserPage, sendMessage } from "./helpers";

/**
 * Regression: notifications came back after being read. Real backend, two users: once something is
 * read it stays read across reloads, and new activity still shows up.
 */
test.describe("read state sticks", () => {
  test.skip(!FULL, FULL_REASON);

  test("a DM read once doesn't come back after reloading; a new one does", async ({ browser }) => {
    const ana = await newUserPage(browser, "Ana");
    const ben = await newUserPage(browser, "Ben");

    await ana.page.goto("/tambayan/friends");
    await ana.page.getByRole("tab", { name: "Add Friend" }).click();
    await ana.page.getByLabel("Username").fill(`@${ben.user.username}`);
    await ana.page.getByRole("button", { name: "Send" }).click();
    await ben.page.goto("/tambayan/friends");
    await ben.page.getByRole("tab", { name: /Pending/ }).click();
    await ben.page.getByTestId("friend-row").filter({ hasText: ana.user.displayName }).getByRole("button", { name: "Accept" }).click();

    await ana.page.goto("/tambayan/friends");
    await ana.page.getByRole("tab", { name: "All" }).click();
    await ana.page.getByRole("button", { name: `Message ${ben.user.displayName}` }).click();
    await sendMessage(ana.page, "Gising ka pa?");

    // Ben sees it as new…
    const bell = ben.page.getByRole("button", { name: /^Notifications/ });
    await expect(bell).toHaveAccessibleName(/new/, { timeout: 15_000 });
    await bell.click();
    await ben.page.locator('[data-floating="notification-hub"]').getByRole("link", { name: new RegExp(ana.user.displayName) }).click();
    await expect(messageItem(ben.page, "Gising ka pa?")).toBeVisible();

    // …reads it, and the receipt is confirmed by the server (nothing left queued).
    await expect.poll(() => ben.page.evaluate(() => localStorage.getItem("diskarte:pending-reads")), { timeout: 10_000 }).toBeNull();
    await ben.page.goto("/tambayan");
    await ben.page.reload();
    await expect(bell).toHaveAccessibleName("Notifications");
    await bell.click();
    await expect(ben.page.locator('[data-floating="notification-hub"]')).toContainText(/You.re all caught up\./);
    await ben.page.keyboard.press("Escape");

    // A genuinely new message still notifies.
    await sendMessage(ana.page, "Sige, bukas na lang");
    await expect(bell).toHaveAccessibleName(/new/, { timeout: 15_000 });

    await ana.context.close();
    await ben.context.close();
  });

  test("a channel mention read once stays read after reloading", async ({ browser }) => {
    const owner = await newUserPage(browser, "Kap");
    const name = `Bell ${Date.now().toString(36)}`;
    const serverUrl = await createServer(owner.page, name);
    const invite = await inviteLink(owner.page);
    const member = await newUserPage(browser, "Juan");
    await member.page.goto(invite);
    await member.page.getByRole("button", { name: "Join server" }).click();
    await expect(member.page.getByTestId("channel-title")).toHaveText("general");
    await member.page.goto("/tambayan");

    await owner.page.goto(serverUrl);
    await expect(owner.page.getByTestId("channel-title")).toHaveText("general");
    await sendMessage(owner.page, `@${member.user.username} tara na`);

    const rail = member.page.getByRole("navigation", { name: "Servers" });
    const mentioned = rail.getByRole("link", { name: `${name}, 1 mention` });
    await expect(mentioned).toBeVisible({ timeout: 40_000 });
    await mentioned.click();
    await expect(messageItem(member.page, "tara na")).toBeVisible();
    await expect.poll(() => member.page.evaluate(() => localStorage.getItem("diskarte:pending-reads")), { timeout: 10_000 }).toBeNull();

    await member.page.goto("/tambayan");
    await member.page.reload();
    // Only this server's state matters (Diskarte HQ may have activity from other tests).
    await expect(rail.getByRole("link", { name, exact: true })).toBeVisible();

    await owner.context.close();
    await member.context.close();
  });
});
