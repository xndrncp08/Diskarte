/**
 * During Early Access, set SIGNUP_MODE=invite: public sign-up is closed and /signup points people
 * at the waitlist portal (EARLY_ACCESS_URL). Accounts are then created only by approved
 * applications (early-access-portal) — also switch off "Allow new users to sign up" in Supabase
 * Auth so OAuth can't create accounts either (see DEPLOYMENT.md). Read at runtime.
 */
export interface SignupPolicy {
  inviteOnly: boolean;
  earlyAccessUrl: string | null;
}

export function signupPolicy(env: Record<string, string | undefined> = process.env): SignupPolicy {
  const inviteOnly = (env.SIGNUP_MODE ?? "").trim().toLowerCase() === "invite";
  const raw = env.EARLY_ACCESS_URL?.trim();
  let earlyAccessUrl: string | null = null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") earlyAccessUrl = url.toString().replace(/\/$/, "");
    } catch {
      earlyAccessUrl = null;
    }
  }
  return { inviteOnly, earlyAccessUrl };
}
