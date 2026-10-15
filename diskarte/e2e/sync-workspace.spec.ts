import { expect, test, type Page } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, logIn, newUserPage } from "./helpers";

function savedDraft(page: Page, text: string) {
  return page.waitForResponse((response) => {
    if (!response.url().endsWith("/rest/v1/rpc/save_account_state") || response.status() !== 200) return false;
    const body = response.request().postDataJSON();
    return body.p_key?.startsWith("draft:") && body.p_value === text;
  });
}

test.describe("synchronized account and shared workspace", () => {
  test.skip(!FULL, FULL_REASON);
  test("restores drafts on another device, preserves offline conflicts and syncs appearance", async ({ browser }) => {
    const first = await newUserPage(browser, "Sync");
    const second = await browser.newContext();
    const other = await second.newPage();
    try {
      await createServer(first.page, `Sync ${Date.now().toString(36)}`);
      const conversation = first.page.url();
      const persisted = savedDraft(first.page, "Draft from desktop");
      await first.page.getByTestId("composer").fill("Draft from desktop"); await persisted;
      await logIn(other, first.user); await other.goto(conversation);
      await expect(other.getByTestId("composer")).toHaveValue("Draft from desktop");
      await second.setOffline(true);
      await other.getByTestId("composer").fill("Offline phone edits");
      const changed = savedDraft(first.page, "Updated desktop draft");
      await first.page.getByTestId("composer").fill("Updated desktop draft"); await changed;
      await second.setOffline(false);
      await expect(other.getByText("This was changed on another device. Your local edits are still here.")).toBeVisible();
      await expect(other.getByTestId("composer")).toHaveValue("Offline phone edits");
      await other.getByRole("button", { name: "Use the other device’s version" }).click();
      await expect(other.getByTestId("composer")).toHaveValue("Updated desktop draft");
      const cleared = savedDraft(other, "");
      await other.getByTestId("composer").press("Enter"); await cleared;
      await expect(first.page.getByTestId("composer")).toHaveValue("");
      await first.page.getByTestId("user-panel").getByRole("link", { name: "User settings" }).click();
      await first.page.getByRole("dialog", { name: "User settings" }).getByRole("tab", { name: "Appearance", exact: true }).click();
      const prefs = first.page.waitForResponse((response) => response.url().endsWith("/rest/v1/rpc/save_account_state") && response.status() === 200 && response.request().postDataJSON()?.p_value?.colorMode === "light");
      await first.page.getByRole("radiogroup", { name: "Color mode" }).getByRole("radio", { name: "Light", exact: true }).click(); await prefs;
      await expect(other.locator("html")).toHaveAttribute("data-color-mode", "light");
    } finally { await first.context.close(); await second.close(); }
  });

  test("shares resources and drawings, while requiring a choice after concurrent edits", async ({ browser }) => {
    const owner = await newUserPage(browser, "Workspace");
    const member = await newUserPage(browser, "Collaborator");
    try {
      const server = await createServer(owner.page, `Workspace ${Date.now().toString(36)}`);
      await member.page.goto(await inviteLink(owner.page));
      await member.page.getByRole("button", { name: "Join server" }).click();
      await expect(member.page.getByTestId("channel-title")).toHaveText("general");
      await owner.page.goto(`${server}/workspace`); await member.page.goto(`${server}/workspace`);
      await owner.page.getByRole("button", { name: "Shared resources", exact: true }).click();
      await owner.page.getByLabel("Resource title").fill("Study guide");
      await owner.page.getByLabel("HTTPS link").fill("https://example.com/study");
      await owner.page.getByRole("button", { name: "Add resource", exact: true }).click();
      await owner.page.getByRole("button", { name: "Save resources" }).click();
      await expect(owner.page.getByText(/Revision 1\./)).toBeVisible();
      await member.page.getByRole("button", { name: "Shared resources", exact: true }).click();
      await expect(member.page.getByRole("link", { name: "Study guide" })).toHaveAttribute("href", "https://example.com/study");
      await member.page.getByLabel("Resource title").fill("Phone draft");
      await member.page.getByLabel("HTTPS link").fill("https://example.com/phone");
      await member.page.getByRole("button", { name: "Add resource", exact: true }).click();
      await owner.page.getByLabel("Resource title").fill("Desktop update");
      await owner.page.getByLabel("HTTPS link").fill("https://example.com/desktop");
      await owner.page.getByRole("button", { name: "Add resource", exact: true }).click();
      await owner.page.getByRole("button", { name: "Save resources" }).click();
      await expect(member.page.getByText("Another version is available. Your local changes are preserved.")).toBeVisible();
      await expect(member.page.getByRole("link", { name: "Phone draft" })).toBeVisible();
      await member.page.getByRole("button", { name: "Use the shared version" }).click();
      await expect(member.page.getByRole("link", { name: "Desktop update" })).toBeVisible();
      await expect(member.page.getByRole("link", { name: "Phone draft" })).toHaveCount(0);
      await owner.page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await member.page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await owner.page.getByRole("button", { name: "Whiteboard", exact: true }).click();
      const canvas = owner.page.getByRole("img", { name: /Shared drawing/ });
      const box = (await canvas.boundingBox())!;
      await owner.page.mouse.move(box.x + 30, box.y + 30); await owner.page.mouse.down();
      await owner.page.mouse.move(box.x + 80, box.y + 80, { steps: 4 }); await owner.page.mouse.up();
      await owner.page.getByRole("button", { name: "Save whiteboard" }).click();
      await expect(owner.page.getByText(/Revision 1\./)).toBeVisible();
      await member.page.getByRole("button", { name: "Whiteboard", exact: true }).click();
      await expect(member.page.getByRole("img", { name: /Shared drawing, 1 strokes/ })).toBeVisible();
    } finally { await owner.context.close(); await member.context.close(); }
  });
});
