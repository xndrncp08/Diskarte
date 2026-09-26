import { expect, test } from "@playwright/test";
import { FULL, FULL_REASON, logIn, makeUser, signUpAndOnboard } from "./helpers";

test.describe("registration and profile customisation", () => {
  test.skip(!FULL, FULL_REASON);

  test("sign up, build a salakot profile, and keep it after logging back in", async ({ page }) => {
    const user = makeUser("Juan");
    await signUpAndOnboard(page, user, { avatar: "Ube", status: "Nagluto ng Canton", bio: "Main ko si Jett." });

    // Profile card on the home screen reflects the onboarding choices.
    await page.getByTestId("user-panel").getByRole("button", { name: /Set status/ }).click();
    await page.getByRole("menuitem", { name: "Do Not Disturb" }).click();
    await expect(page.getByTestId("user-panel")).toContainText("Nagluto ng Canton");

    await page.goto("/settings/profile");
    const builder = page.getByTestId("profile-builder");
    await expect(builder.getByRole("radio", { name: "Ube" })).toHaveAttribute("aria-checked", "true");
    await expect(builder.getByRole("radio", { name: /Do Not Disturb/ })).toHaveAttribute("aria-checked", "true");
    await expect(builder.getByLabel("Bio")).toHaveValue("Main ko si Jett.");

    // Customise further: new banner, custom status, display name.
    await builder.getByRole("radio", { name: /Watawat/ }).click();
    await builder.getByRole("button", { name: /LFG/ }).click();
    await builder.getByLabel("Display name").fill(`${user.displayName} PH`);
    await builder.getByRole("button", { name: "I-save ang profile" }).click();
    await expect(page.getByText("Na-save na ang profile mo!")).toBeVisible();
    await expect(page.getByTestId("profile-card")).toContainText(`${user.displayName} PH`);
    await expect(page.getByTestId("profile-card")).toContainText("LFG");

    // Sessions: log out, then back in.
    await page.goto("/settings/account");
    await page.getByRole("button", { name: "Log out dito" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tambayan");
    await expect(page).toHaveURL(/\/login\?next=/);
    await logIn(page, user);
    await expect(page.getByTestId("user-panel")).toContainText(`${user.displayName} PH`);
  });

  test("duplicate usernames are rejected at sign-up", async ({ page, browser }) => {
    const first = makeUser("Maria");
    await signUpAndOnboard(page, first);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto("/signup");
    await p2.getByLabel("Display name").fill("Impostor");
    await p2.getByLabel("Username").fill(first.username);
    await p2.getByLabel("Email").fill(makeUser("x").email);
    await p2.getByLabel("Password", { exact: true }).fill("Diskarte!12345");
    await p2.getByRole("button", { name: "Sali na!" }).click();
    await expect(p2.getByText("May gumagamit na ng username na 'yan.")).toBeVisible();
    await other.close();
  });
});
