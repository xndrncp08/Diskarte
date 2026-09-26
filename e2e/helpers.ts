import { expect, type Browser, type Page } from "@playwright/test";

export const FULL = process.env.E2E_FULL === "1";
export const FULL_REASON = "needs Supabase + LiveKit (set E2E_FULL=1; CI starts both locally)";

export interface TestUser {
  displayName: string;
  username: string;
  email: string;
  password: string;
}

export function makeUser(label: string): TestUser {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    displayName: `${label} ${id.slice(-4)}`,
    username: `e2e_${label.toLowerCase()}_${id}`.slice(0, 32),
    email: `e2e+${label.toLowerCase()}.${id}@diskarte.test`,
    password: `Diskarte!${id}`,
  };
}

/** Sign up through the UI and finish onboarding with the default salakot avatar. */
export async function signUpAndOnboard(page: Page, user: TestUser, opts: { avatar?: string; status?: string; bio?: string } = {}) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(user.displayName);
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sali na!" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: new RegExp(`Buuin ang profile mo, ${user.displayName}`) })).toBeVisible();
  if (opts.avatar) await page.getByRole("radio", { name: opts.avatar }).click();
  if (opts.status) await page.getByRole("button", { name: new RegExp(opts.status) }).click();
  if (opts.bio) await page.getByLabel("Bio").fill(opts.bio);
  await page.getByRole("button", { name: "Tara na sa tambayan!" }).click();
  await expect(page).toHaveURL(/\/tambayan$/);
  await expect(page.getByRole("heading", { name: `Mabuhay, ${user.displayName}!` })).toBeVisible();
}

export async function logIn(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Pasok!" }).click();
  await expect(page).toHaveURL(/\/tambayan/);
}

/** Create a Tambayan from the home screen; resolves once #general is open. Returns the server URL. */
export async function createServer(page: Page, name: string) {
  await page.goto("/tambayan");
  await page.getByRole("button", { name: /Gumawa ng Tambayan/ }).click();
  const dialog = page.getByRole("dialog", { name: "Gumawa ng Tambayan" });
  await dialog.getByLabel("Pangalan ng tambayan").fill(name);
  await dialog.getByRole("button", { name: "Gawin na!" }).click();
  await expect(page.getByTestId("channel-title")).toHaveText("general");
  return page.url().replace(/\/[^/]+$/, "");
}

export async function inviteLink(page: Page) {
  await page.getByTestId("server-menu").click();
  await page.getByRole("menuitem", { name: "Invite people" }).click();
  const url = await page.getByTestId("invite-url").inputValue();
  await page.keyboard.press("Escape");
  return url;
}

export async function sendMessage(page: Page, text: string) {
  const composer = page.getByTestId("composer");
  await composer.fill(text);
  await composer.press("Enter");
}

export function messageItem(page: Page, text: string) {
  return page.getByTestId("message").filter({ hasText: text });
}

/** Hover a message and click one of its toolbar actions. */
export async function messageAction(page: Page, text: string, action: string, modifiers?: ("Shift" | "Alt")[]) {
  const item = messageItem(page, text).last();
  await item.hover();
  await item.getByRole("toolbar", { name: "Message actions" }).getByRole("button", { name: action }).click({ modifiers });
}

export async function newUserPage(browser: Browser, label: string) {
  const context = await browser.newContext({ permissions: ["microphone", "camera"] });
  const page = await context.newPage();
  const user = makeUser(label);
  await signUpAndOnboard(page, user);
  return { context, page, user };
}
