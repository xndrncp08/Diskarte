import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";
import { EMAIL_OUTBOX, PORTAL_URL } from "./portal";
import { FULL, FULL_REASON, makeUser } from "./helpers";

/**
 * Early Access end to end, across both apps:
 * apply on the portal → super admin approves → credentials email → first login on Diskarte forces
 * a new password → onboarding.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Wait for entrance fades to finish: axe measures a half-faded button against a blended background. */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  await page.waitForTimeout(250);
}

async function createSuperAdmin() {
  const admin = makeUser("Boss");
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: admin.email, password: admin.password, email_confirm: true, user_metadata: { username: admin.username, display_name: admin.displayName } }),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  const { id } = (await res.json()) as { id: string };
  const grant = await fetch(`${SUPABASE_URL}/rest/v1/platform_admins`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ user_id: id }) });
  expect(grant.ok, await grant.clone().text()).toBe(true);
  return admin;
}

function credentialsFor(email: string) {
  for (const file of readdirSync(EMAIL_OUTBOX)) {
    const mail = JSON.parse(readFileSync(path.join(EMAIL_OUTBOX, file), "utf8")) as { to: string; subject: string; text: string; html: string };
    if (mail.to !== email) continue;
    const password = mail.text.match(/Temporary password: (\S+)/)?.[1];
    return { mail, password };
  }
  return null;
}

test.describe("early access portal", () => {
  test.skip(!FULL, FULL_REASON);

  test("apply → approve → emailed credentials → forced password change on first login", async ({ browser }) => {
    test.setTimeout(120_000);
    const applicant = makeUser("Applicant");
    const admin = await createSuperAdmin();

    // 1) Apply on the public portal.
    const visitor = await browser.newContext();
    const page = await visitor.newPage();
    await page.goto(PORTAL_URL);
    const loadedAt = Date.now();
    // Step 1 · Tungkol sa'yo
    await page.getByLabel("Buong pangalan").fill(applicant.displayName);
    await page.getByLabel("Email", { exact: true }).fill(applicant.email);
    await page.getByLabel(/Gustong @username/).fill(applicant.username);
    await page.getByRole("button", { name: /Susunod/ }).click();
    // Step 2 · Ang komunidad mo
    await page.getByRole("radio", { name: /Gaming squad/ }).click();
    await page.getByRole("button", { name: /Susunod/ }).click();
    // Step 3 · Kwento mo
    await page.getByLabel("Bakit mo gustong sumali?").fill("Lilipat na ang Valorant squad namin mula Discord — sana makasali kami!");
    await page.getByRole("checkbox", { name: /Pumapayag/ }).check();
    // The signed form token rejects submissions within 3 seconds of the page loading.
    await page.waitForTimeout(Math.max(0, 3_300 - (Date.now() - loadedAt)));
    await page.getByRole("button", { name: /Sumali sa waitlist/ }).click();
    await expect(page.getByTestId("apply-success")).toContainText(`Nasa pila ka na, ${applicant.displayName.split(" ")[0]}!`);

    // 2) The dashboard is closed to anyone who isn't a super admin.
    await page.goto(`${PORTAL_URL}/admin`);
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);

    // 3) A super admin approves the application.
    const staff = await browser.newContext();
    const adminPage = await staff.newPage();
    await adminPage.goto(`${PORTAL_URL}/admin`);
    await adminPage.getByLabel("Email", { exact: true }).fill(admin.email);
    await adminPage.getByLabel("Password", { exact: true }).fill(admin.password);
    await adminPage.getByRole("button", { name: "Pumasok bilang admin" }).click();
    await expect(adminPage.getByRole("heading", { name: "Review queue" })).toBeVisible();
    await adminPage.getByLabel("Search applications").fill(applicant.email);
    await adminPage.getByLabel("Search applications").press("Enter");
    const row = adminPage.getByTestId("application-row").filter({ hasText: applicant.email });
    await expect(row).toHaveAttribute("data-status", "pending");
    await row.getByRole("button", { name: `Approve ${applicant.displayName}` }).click();
    await expect(adminPage.getByTestId("review-notice")).toContainText("1 approved");

    // 4) The welcome email carries a working temporary password.
    await expect.poll(() => credentialsFor(applicant.email)?.password ?? null, { timeout: 15_000 }).not.toBeNull();
    const { mail, password } = credentialsFor(applicant.email)!;
    expect(mail.subject).toContain("Maligayang Pagdating sa Diskarte");
    const loginLink = mail.html.match(/href="([^"]*\/login\?[^"]*)"/)?.[1]?.replaceAll("&amp;", "&");
    expect(loginLink).toBeTruthy();

    // 5) The email's button lands on the Diskarte app's login, greeting them with the email pre-filled;
    //    the first login goes straight to "change your temporary password", then onboarding.
    await page.goto(loginLink!);
    await expect(page.getByTestId("early-access-welcome")).toContainText("Welcome to Diskarte!");
    await expect(page.getByLabel("Email")).toHaveValue(applicant.email);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/reset-password\?first=1$/);
    await expect(page.getByRole("heading", { name: "Change your temporary password" })).toBeVisible();
    await page.goto("/tambayan");
    await expect(page).toHaveURL(/\/reset-password\?first=1$/); // no way around it
    await page.getByLabel("New password").fill(applicant.password);
    await page.getByLabel("Confirm new password").fill(applicant.password);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: new RegExp(`Set up your profile, ${applicant.displayName}`) })).toBeVisible();

    // 6) The dashboard now lists the application as approved.
    await adminPage.goto(`${PORTAL_URL}/admin?status=approved&q=${encodeURIComponent(applicant.email)}`);
    await expect(adminPage.getByTestId("application-row").filter({ hasText: applicant.email })).toHaveAttribute("data-status", "approved");

    await visitor.close();
    await staff.close();
  });

  test("portal is phone-friendly and accessible", async ({ browser }) => {
    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const page = await phone.newPage();
    await page.goto(PORTAL_URL);
    await expect(page.getByRole("heading", { name: /Mauna sa bagong/ })).toBeVisible();
    // No sideways scrolling on a 412 px screen, even with the floating mesh and chips.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const next = (await page.getByRole("button", { name: /Susunod/ }).boundingBox())!;
    const login = (await page.getByRole("link", { name: "Mag-login", exact: true }).boundingBox())!;
    expect(next.height).toBeGreaterThanOrEqual(44);
    expect(login.height).toBeGreaterThanOrEqual(44);
    await settled(page);
    const landing = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(landing.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await page.goto(`${PORTAL_URL}/admin/login`);
    await page.getByTestId("admin-login").waitFor();
    await settled(page);
    const adminLogin = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(adminLogin.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await phone.close();
  });
});
