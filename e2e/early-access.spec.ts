import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { EMAIL_OUTBOX, PORTAL_URL } from "./portal";
import { FULL, FULL_REASON, makeUser } from "./helpers";

/**
 * Early Access end to end, across both apps:
 * apply on the portal → super admin approves → credentials email → first login on Diskarte forces
 * a new password → onboarding.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

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
    await page.getByLabel("Buong pangalan").fill(applicant.displayName);
    await page.getByLabel("Email").fill(applicant.email);
    await page.getByLabel("Gustong @username").fill(applicant.username);
    await page.getByText("Gaming squad / guild").click();
    await page.getByLabel("Bakit mo gustong sumali?").fill("Lilipat na ang Valorant squad namin mula Discord — sana makasali kami!");
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(3_200); // the signed form token rejects sub-3-second submissions
    await page.getByRole("button", { name: /Sumali sa waitlist/ }).click();
    await expect(page.getByTestId("apply-success")).toContainText(`Nasa pila ka na, ${applicant.displayName.split(" ")[0]}!`);

    // 2) The dashboard is closed to anyone who isn't a super admin.
    await page.goto(`${PORTAL_URL}/admin`);
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);

    // 3) A super admin approves the application.
    const staff = await browser.newContext();
    const adminPage = await staff.newPage();
    await adminPage.goto(`${PORTAL_URL}/admin`);
    await adminPage.getByLabel("Email").fill(admin.email);
    await adminPage.getByLabel("Password").fill(admin.password);
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
    expect(mail.html).toContain("/login");

    // 5) First login on Diskarte: straight to "change your temporary password", then onboarding.
    await page.goto("/login");
    await page.getByLabel("Email").fill(applicant.email);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Pasok!" }).click();
    await expect(page).toHaveURL(/\/reset-password\?first=1$/);
    await expect(page.getByRole("heading", { name: "Palitan muna ang temporary password mo" })).toBeVisible();
    await page.goto("/tambayan");
    await expect(page).toHaveURL(/\/reset-password\?first=1$/); // no way around it
    await page.getByLabel("Bagong password").fill(applicant.password);
    await page.getByLabel("Ulitin ang password").fill(applicant.password);
    await page.getByRole("button", { name: "Palitan ang password" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("heading", { name: new RegExp(`Buuin ang profile mo, ${applicant.displayName}`) })).toBeVisible();

    // 6) The dashboard now lists the application as approved.
    await adminPage.goto(`${PORTAL_URL}/admin?status=approved&q=${encodeURIComponent(applicant.email)}`);
    await expect(adminPage.getByTestId("application-row").filter({ hasText: applicant.email })).toHaveAttribute("data-status", "approved");

    await visitor.close();
    await staff.close();
  });
});
