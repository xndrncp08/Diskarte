import { expect, test, type Browser, type Page } from "@playwright/test";
import { FULL, FULL_REASON, logIn, makeUser, type TestUser } from "./helpers";

/**
 * Super Admin Control Center, end to end:
 * - non-admins are bounced from every admin route and the API answers 403;
 * - a super admin docks the Control Center on the canvas, broadcasts a sticky announcement that
 *   appears live on another member's open canvas (no reload), changes their role, and bans them —
 *   which signs their open tab out.
 * Accounts and the super_admin grant are made with the service role, like `npm run admin:grant`.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HQ = "d15ca47e-0000-4000-8000-000000000001";
const ANNOUNCEMENTS = "d15ca47e-0000-4000-8000-0000000000a1";

const headers = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" });

/** A confirmed, onboarded account (optionally a platform super admin). */
async function createAccount(label: string, role?: "super_admin"): Promise<TestUser & { id: string }> {
  const user = makeUser(label);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: user.email, password: user.password, email_confirm: true, user_metadata: { username: user.username, display_name: user.displayName } }),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  const { id } = (await res.json()) as { id: string };
  const onboard = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify({ onboarded: true }) });
  expect(onboard.ok, await onboard.clone().text()).toBe(true);
  if (role) {
    const grant = await fetch(`${SUPABASE_URL}/rest/v1/platform_admins`, { method: "POST", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify({ user_id: id, role }) });
    expect(grant.ok, await grant.clone().text()).toBe(true);
  }
  return { ...user, id };
}

async function signedIn(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await logIn(page, user);
  return page;
}

test.describe("Super Admin Control Center", () => {
  test.skip(!FULL, FULL_REASON);

  test("standard members are redirected to the canvas and refused by the API", async ({ browser }) => {
    const member = await createAccount("Member");
    const page = await signedIn(browser, member);

    for (const path of ["/admin", "/tambayan/admin"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/tambayan$/);
      await expect(page.getByTestId("admin-control-center")).toHaveCount(0);
    }
    await expect(page.getByTestId("control-center-toggle")).toHaveCount(0);
    const api = await page.request.get("/api/admin/snapshot");
    expect(api.status()).toBe(403);
    expect(await api.json()).toEqual({ error: "Forbidden" });
  });

  test("broadcasts live to connected canvases, then moderates the account", async ({ browser }) => {
    test.setTimeout(150_000);
    const admin = await createAccount("Boss", "super_admin");
    const member = await createAccount("Kabayan");
    const adminPage = await signedIn(browser, admin);
    const memberPage = await signedIn(browser, member);

    // The Control Center docks on the right of the canvas and shares a seam with chat.
    await adminPage.getByTestId("control-center-toggle").click();
    const center = adminPage.getByTestId("admin-control-center");
    await expect(center).toBeVisible();
    await expect(center.getByTestId("roster-row").first()).toBeVisible();
    const main = (await adminPage.locator('[data-panel="main"]').boundingBox())!;
    const panel = (await adminPage.locator('[data-panel="admin"]').boundingBox())!;
    expect(Math.abs(panel.x - (main.x + main.width) - 12)).toBeLessThanOrEqual(2);

    // Compose and dispatch a sticky announcement.
    const title = `Maintenance ${Date.now().toString(36)}`;
    await center.getByRole("tab", { name: "Broadcast" }).click();
    await center.getByTestId("broadcast-title").fill(title);
    await center.getByTestId("broadcast-body").fill("> [!WARNING]\n> Voice restarts at 23:00 PHT.");
    await center.getByRole("switch", { name: "Sticky global banner" }).click();
    await center.getByTestId("broadcast-send").click();
    await adminPage.getByRole("dialog").getByRole("button", { name: "Broadcast" }).click();

    // The member's already-open canvas gets the banner without a reload.
    const banner = memberPage.getByTestId("broadcast-banner");
    await expect(banner).toContainText(title, { timeout: 20_000 });
    await banner.getByRole("link", { name: "Read" }).click();
    await expect(memberPage).toHaveURL(new RegExp(`/tambayan/${HQ}/${ANNOUNCEMENTS}$`));
    await expect(memberPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(memberPage.getByRole("note", { name: "Warning" }).first()).toContainText("Voice restarts at 23:00 PHT.");

    // Role change, logged in the audit trail.
    await center.getByRole("tab", { name: "Network" }).click();
    await center.getByTestId("roster-search").fill(member.username);
    await center.locator(`[data-testid="roster-row"][data-user="${member.username}"]`).click();
    const inspector = center.getByTestId("user-inspector");
    await inspector.getByRole("radio", { name: "Moderator" }).click();
    await expect(inspector.getByRole("radio", { name: "Moderator" })).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
    await inspector.getByRole("button", { name: "Back to roster" }).click();
    await center.getByRole("tab", { name: "Audit" }).click();
    await expect(center.getByTestId("audit-row").filter({ hasText: member.displayName }).first()).toContainText("changed role");

    // A ban signs the member's open tab out and keeps them out.
    await center.getByRole("tab", { name: "Network" }).click();
    await center.locator(`[data-testid="roster-row"][data-user="${member.username}"]`).click();
    await inspector.getByLabel("Ban length").selectOption("1");
    await inspector.getByRole("button", { name: "Ban", exact: true }).click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByRole("textbox").fill("E2E moderation check");
    await dialog.getByRole("button", { name: "Ban account" }).click();

    await expect(memberPage).toHaveURL(/\/login/, { timeout: 45_000 });
    await expect(memberPage.getByText(/suspended/i)).toBeVisible();
  });
});
