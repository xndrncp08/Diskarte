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
    await builder.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved!")).toBeVisible();
    await expect(page.getByTestId("profile-card")).toContainText(`${user.displayName} PH`);
    await expect(page.getByTestId("profile-card")).toContainText("LFG");

    // Sessions: sign out from the floating Settings window, then back in.
    await page.goto("/tambayan");
    await page.getByTestId("user-panel").getByRole("link", { name: "User settings" }).click();
    await page.getByRole("dialog", { name: "User settings" }).getByRole("button", { name: "Sign out" }).first().click();
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
    await p2.getByLabel("Confirm password").fill("Diskarte!12345");
    await p2.getByRole("button", { name: "Sign up" }).click();
    await expect(p2.getByText("That username is taken.")).toBeVisible();
    await other.close();
  });

  test("an account can be deleted from Settings, after typing the username", async ({ page }) => {
    const user = makeUser("Paalam");
    await signUpAndOnboard(page, user);
    await page.getByTestId("user-panel").getByRole("link", { name: "User settings" }).click();
    const settings = page.getByRole("dialog", { name: "User settings" });
    await settings.getByRole("tab", { name: "Account & Sessions" }).click();
    await settings.getByTestId("danger-zone").getByRole("button", { name: "Delete account" }).click();

    const confirm = page.getByRole("dialog", { name: "Delete your account?" });
    const submit = confirm.getByRole("button", { name: "Delete my account" });
    await expect(submit).toBeDisabled();
    await confirm.getByLabel(/Type your username/).fill(user.username);
    await submit.click();
    await expect(page).toHaveURL(/\/login\?deleted=1$/);
    await expect(page.getByRole("status")).toContainText("Your account and its data were deleted");

    // The credentials no longer work.
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password" })).toBeVisible();
  });
});
