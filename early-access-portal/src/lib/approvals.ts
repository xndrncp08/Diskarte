import type { EmailMessage } from "@/lib/email/template";
import { welcomeEmail } from "@/lib/email/template";
import { generateTempPassword } from "@/lib/password";
import type { WaitlistStatus } from "@/lib/schema";

/** Row shape of public.waitlist_applications (see supabase/migrations/…_early_access.sql). */
export interface WaitlistRow {
  id: string;
  full_name: string;
  email: string;
  preferred_username: string | null;
  community_type: string;
  community_name: string;
  community_size: string;
  referral_source: string;
  reason: string;
  status: WaitlistStatus;
  decline_reason: string | null;
  admin_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_user_id: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  email_attempts: number;
  created_at: string;
  updated_at: string;
}

/**
 * Everything the approval workflow touches, injected so the state machine and credential
 * handling can be unit-tested without Supabase or an email provider.
 */
export interface ApprovalDeps {
  /** Admin-scoped (RLS) database access: only super admins can read or update rows. */
  db: {
    load(ids: string[]): Promise<WaitlistRow[]>;
    markApproved(id: string, userId: string | null): Promise<void>;
    markDeclined(ids: string[], reason: string | null): Promise<number>;
    recordEmail(id: string, result: { sentAt: string | null; error: string | null; attempts: number }): Promise<void>;
  };
  /** Supabase Auth admin API (service role). */
  auth: {
    createUser(input: { email: string; password: string; metadata: Record<string, unknown> }): Promise<{ id: string } | { exists: true }>;
    resetPassword(userId: string, password: string): Promise<void>;
  };
  mail: (message: EmailMessage) => Promise<{ id: string }>;
  generatePassword?: () => string;
  urls: { login: string; assets: string };
  now?: () => Date;
}

export type ApprovalOutcome =
  | { id: string; result: "approved"; emailed: boolean; existingAccount: boolean; error?: string }
  | { id: string; result: "skipped"; reason: "already_approved" | "not_found" }
  | { id: string; result: "failed"; error: string };

/**
 * The Diskarte app's login page, flagged so it greets Early Access users and pre-fills the email
 * the credentials were sent to (see diskarte/src/app/(auth)/login/page.tsx).
 */
export function appLoginUrl(base: string, email: string) {
  const url = new URL(base);
  url.searchParams.set("from", "early-access");
  url.searchParams.set("email", email);
  return url.toString();
}

function describe(err: unknown) {
  return (err instanceof Error ? err.message : String(err)).slice(0, 480);
}

/** Metadata picked up by the main app's on_auth_user_created trigger and first-login guard. */
export function newAccountMetadata(row: Pick<WaitlistRow, "full_name" | "preferred_username">) {
  return {
    display_name: row.full_name.slice(0, 32),
    ...(row.preferred_username ? { username: row.preferred_username } : {}),
    must_change_password: true,
    source: "early_access",
  };
}

async function deliver(row: WaitlistRow, message: EmailMessage, deps: ApprovalDeps, attempts: number) {
  const now = deps.now ?? (() => new Date());
  try {
    await deps.mail(message);
    await deps.db.recordEmail(row.id, { sentAt: now().toISOString(), error: null, attempts });
    return { emailed: true as const };
  } catch (err) {
    const error = describe(err);
    await deps.db.recordEmail(row.id, { sentAt: null, error, attempts });
    return { emailed: false as const, error };
  }
}

/**
 * pending|declined → approved: create the Auth user with a one-time temporary password, mark the
 * application approved, then email the credentials. Rows are processed one at a time so a
 * failure (e.g. Auth rejects an address) only affects that applicant. The password exists only
 * in memory and in the email — it is never stored or returned to the dashboard.
 */
export async function approveApplications(ids: string[], deps: ApprovalDeps): Promise<ApprovalOutcome[]> {
  const rows = await deps.db.load(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const generate = deps.generatePassword ?? (() => generateTempPassword());
  const outcomes: ApprovalOutcome[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      outcomes.push({ id, result: "skipped", reason: "not_found" });
      continue;
    }
    if (row.status === "approved") {
      outcomes.push({ id, result: "skipped", reason: "already_approved" });
      continue;
    }

    const password = generate();
    let created: { id: string } | { exists: true };
    try {
      created = await deps.auth.createUser({ email: row.email, password, metadata: newAccountMetadata(row) });
    } catch (err) {
      outcomes.push({ id, result: "failed", error: `Hindi nagawa ang account: ${describe(err)}` });
      continue;
    }
    const existingAccount = "exists" in created;
    try {
      await deps.db.markApproved(id, "id" in created ? created.id : null);
    } catch (err) {
      outcomes.push({ id, result: "failed", error: `Na-create ang account pero hindi na-update ang application: ${describe(err)}` });
      continue;
    }

    const message = welcomeEmail({ name: row.full_name, email: row.email, tempPassword: password, loginUrl: appLoginUrl(deps.urls.login, row.email), assetBaseUrl: deps.urls.assets, existingAccount });
    const sent = await deliver(row, message, deps, row.email_attempts + 1);
    outcomes.push({ id, result: "approved", existingAccount, ...sent });
  }
  return outcomes;
}

/** pending → declined (or re-decline with a new reason). Approved applications stay approved. */
export async function declineApplications(ids: string[], reason: string | null, deps: Pick<ApprovalDeps, "db">): Promise<number> {
  const rows = await deps.db.load(ids);
  const eligible = rows.filter((r) => r.status !== "approved").map((r) => r.id);
  if (eligible.length === 0) return 0;
  return deps.db.markDeclined(eligible, reason);
}

/**
 * Re-send credentials for an approved applicant (e.g. the first email bounced). The previous
 * temporary password is unknown by design, so a fresh one is issued and the account is again
 * flagged to change it on first login.
 */
export async function resendCredentials(id: string, deps: ApprovalDeps): Promise<{ emailed: boolean; error?: string }> {
  const [row] = await deps.db.load([id]);
  if (!row || row.status !== "approved") return { emailed: false, error: "Hindi pa approved ang application na 'to." };
  const generate = deps.generatePassword ?? (() => generateTempPassword());
  let password = "";
  if (row.approved_user_id) {
    password = generate();
    try {
      await deps.auth.resetPassword(row.approved_user_id, password);
    } catch (err) {
      return { emailed: false, error: `Hindi ma-reset ang password: ${describe(err)}` };
    }
  }
  const message = welcomeEmail({
    name: row.full_name,
    email: row.email,
    tempPassword: password,
    loginUrl: appLoginUrl(deps.urls.login, row.email),
    assetBaseUrl: deps.urls.assets,
    existingAccount: !row.approved_user_id,
  });
  return deliver(row, message, deps, row.email_attempts + 1);
}
