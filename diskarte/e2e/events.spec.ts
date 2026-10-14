import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createServer, FULL, FULL_REASON, inviteLink, newUserPage } from "./helpers";

test.describe("community events", () => {
  test.skip(!FULL, FULL_REASON);
  test("schedules, RSVPs, edits on mobile, exports a calendar and confirms cancellation", async ({ browser }) => {
    const owner = await newUserPage(browser, "Organizer");
    const member = await newUserPage(browser, "Attendee");
    try {
      await createServer(owner.page, `Calendar ${Date.now().toString(36)}`);
      await member.page.goto(await inviteLink(owner.page));
      await member.page.getByRole("button", { name: "Join server" }).click();
      await expect(member.page.getByTestId("channel-title")).toHaveText("general");

      await owner.page.getByTestId("events-button").click();
      await owner.page.getByRole("button", { name: "Create Event" }).click();
      await owner.page.getByLabel("Event topic").fill("Study together");
      await owner.page.getByRole("button", { name: "Create Event" }).click();
      const ownerList = owner.page.getByTestId("events-list");
      await expect(ownerList).toContainText("Study together");
      await member.page.getByTestId("events-button").click();
      const memberList = member.page.getByTestId("events-list");
      await expect(memberList).toContainText("Study together");
      await expect(member.page.getByRole("button", { name: "Edit Study together" })).toHaveCount(0);
      await memberList.getByRole("button", { name: "Interested · 0" }).click();
      await expect(memberList.getByRole("button", { name: "Interested · 1" })).toHaveAttribute("aria-pressed", "true");
      await expect(ownerList).toContainText("Interested · 1");

      await owner.page.getByRole("button", { name: "Edit Study together" }).click();
      await owner.page.setViewportSize({ width: 375, height: 812 });
      await owner.page.getByLabel("Event topic").fill("Study; sama-sama");
      await owner.page.getByLabel("Description").fill("Bring notes, pencils and questions.");
      await owner.page.getByRole("button", { name: "Save event" }).click();
      await expect(memberList).toContainText("Study; sama-sama");
      await expect(memberList).toContainText("Interested · 1");

      const downloadReady = owner.page.waitForEvent("download");
      await owner.page.getByRole("button", { name: "Add Study; sama-sama to calendar" }).click();
      const download = await downloadReady;
      const calendar = await readFile((await download.path())!, "utf8");
      expect(download.suggestedFilename()).toMatch(/\.ics$/);
      expect(calendar).toContain("SUMMARY:Study\\; sama-sama\r\n");
      expect(calendar).toContain("DTSTART:");

      await owner.page.getByRole("button", { name: "Cancel Study; sama-sama" }).click();
      await expect(owner.page.getByText("This removes the event and everyone’s RSVPs.")).toBeVisible();
      await expect(memberList).toContainText("Study; sama-sama");
      await owner.page.getByRole("button", { name: "Cancel event", exact: true }).click();
      await expect(memberList).not.toContainText("Study; sama-sama");
    } finally { await owner.context.close(); await member.context.close(); }
  });
});
