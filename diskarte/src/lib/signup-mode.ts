/**
 * SIGNUP_MODE=invite closes public sign-up: /signup explains that registrations are paused and
 * new accounts can only be created from the Supabase dashboard (Auth → Invite user). Also switch off
 * "Allow new users to sign up" in Supabase Auth so OAuth can't create accounts either (see
 * DEPLOYMENT.md). Read at runtime.
 */
export interface SignupPolicy {
  inviteOnly: boolean;
}

export function signupPolicy(env: Record<string, string | undefined> = process.env): SignupPolicy {
  return { inviteOnly: (env.SIGNUP_MODE ?? "").trim().toLowerCase() === "invite" };
}
