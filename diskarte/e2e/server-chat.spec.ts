import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, makeUser, messageAction, messageItem, newUserPage, sendMessage, signUpAndOnboard } from "./helpers";

test.describe("servers, channels and real-time chat", () => {
  test.skip(!FULL, FULL_REASON);

  test("create a tambayan, switch channels, invite a friend and chat in real time", async ({ page, browser }) => {
    const owner = makeUser("Kapitan");
    await signUpAndOnboard(page, owner);
    const serverName = `E2E Barkada ${Date.now().toString(36)}`;
    await createServer(page, serverName);

    // Default Filipino channels exist and switching works.
    const channels = page.getByRole("navigation", { name: "Channels" });
    for (const name of ["general", "chika", "lfg-valorant", "Tambayan 1", "Chill & Music"]) await expect(channels.getByRole("link", { name })).toBeVisible();
    await sendMessage(page, "Mabuhay! **Welcome** sa tambayan :petmalu:");
    await expect(messageItem(page, "Mabuhay!").locator("strong")).toHaveText("Welcome");
    await expect(messageItem(page, "Mabuhay!").locator('[data-glyph=":petmalu:"]')).toBeVisible(); // drawn as an icon, never an emoji

    await channels.getByRole("link", { name: "chika" }).click();
    await expect(page.getByTestId("channel-title")).toHaveText("chika");
    await sendMessage(page, "Chika muna tayo");
    await expect(messageItem(page, "Chika muna tayo")).toBeVisible();
    await channels.getByRole("link", { name: "general" }).click();
    await expect(page.getByTestId("channel-title")).toHaveText("general");
    await expect(messageItem(page, "Mabuhay!")).toBeVisible();
    await expect(messageItem(page, "Chika muna tayo")).toHaveCount(0);

    // Invite a second user through the shareable link.
    const invite = await inviteLink(page);
    expect(invite).toMatch(/\/invite\/[A-Z2-9]{10}$/);
    const friend = await newUserPage(browser, "Maria");
    await friend.page.goto(invite);
    await expect(friend.page.getByRole("heading", { name: serverName })).toBeVisible();
    await friend.page.getByRole("button", { name: "Join server" }).click();
    await expect(friend.page.getByTestId("channel-title")).toHaveText("general");
    await expect(messageItem(friend.page, "Mabuhay!")).toBeVisible();

    // Messages and reactions flow both ways without reloading.
    await sendMessage(friend.page, "Salamat sa invite!");
    await expect(messageItem(page, "Salamat sa invite!")).toBeVisible();
    await messageAction(page, "Salamat sa invite!", "Add reaction");
    await page.getByRole("dialog", { name: "Icon picker" }).getByRole("button", { name: "Lodi" }).click();
    await expect(messageItem(friend.page, "Salamat sa invite!").getByRole("button", { name: "Lodi: 1 reaction" })).toBeVisible();

    // Edit, pin and delete.
    await sendMessage(page, "Typo sa messge");
    await messageAction(page, "Typo sa messge", "Edit");
    const edit = page.getByRole("textbox", { name: "Edit message" });
    await edit.fill("Ayos na ang message");
    await edit.press("Enter");
    await expect(messageItem(page, "Ayos na ang message")).toContainText("(edited)");
    await expect(messageItem(friend.page, "Ayos na ang message")).toBeVisible();

    await messageAction(page, "Ayos na ang message", "Pin");
    await page.getByRole("button", { name: "Pinned messages" }).click();
    await expect(page.getByTestId("pins-drawer")).toContainText("Ayos na ang message");
    await page.getByRole("button", { name: "Close pins" }).click();

    await messageAction(page, "Ayos na ang message", "Delete", ["Shift"]);
    await expect(messageItem(page, "Ayos na ang message")).toHaveCount(0);
    await expect(messageItem(friend.page, "Ayos na ang message")).toHaveCount(0);

    // Members see each other with roles.
    await expect(page.getByTestId("member-list")).toContainText(friend.user.displayName);
    await friend.context.close();
  });

  test("members cannot moderate, and non-members cannot see the server", async ({ page, browser }) => {
    const owner = makeUser("Owner");
    await signUpAndOnboard(page, owner);
    const serverUrl = await createServer(page, `Private ${Date.now().toString(36)}`);
    await sendMessage(page, "Admin lang ang pwedeng mag-pin nito");

    const outsider = await newUserPage(browser, "Outsider");
    await outsider.page.goto(serverUrl);
    await expect(outsider.page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    const invite = await inviteLink(page);
    await outsider.page.goto(invite);
    await outsider.page.getByRole("button", { name: "Join server" }).click();
    const item = messageItem(outsider.page, "Admin lang ang pwedeng mag-pin nito");
    await item.hover();
    const toolbar = item.getByRole("toolbar", { name: "Message actions" });
    await expect(toolbar.getByRole("button", { name: "Reply" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Pin" })).toHaveCount(0);
    await expect(toolbar.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await outsider.page.getByTestId("server-menu").click();
    await expect(outsider.page.getByRole("menuitem", { name: "Create channel" })).toHaveCount(0);
    await expect(outsider.page.getByRole("menuitem", { name: "Leave server" })).toBeVisible();
    await outsider.context.close();
  });

  test("every new account is already in Diskarte HQ: announcements are creators-only, the lounge is open", async ({ page }) => {
    const user = makeUser("Bago");
    await signUpAndOnboard(page, user);
    const hq = page.getByTestId("pinned-server");
    await expect(hq).toHaveAccessibleName("Diskarte HQ (official)");
    await hq.click();

    const channels = page.getByRole("navigation", { name: "Channels" });
    await channels.getByRole("link", { name: "announcements" }).click();
    await expect(page.getByTestId("composer-locked")).toHaveText("Only creators can post in this channel.");

    await channels.getByRole("link", { name: "global-lounge" }).click();
    await sendMessage(page, `Hello from ${user.displayName}!`);
    await expect(messageItem(page, `Hello from ${user.displayName}!`)).toBeVisible();

    await page.getByTestId("server-menu").click();
    await expect(page.getByRole("menuitem", { name: "Leave server" })).toHaveCount(0);
  });
});
