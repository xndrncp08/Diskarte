import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

/** Verified user for this request (deduplicated across layouts/pages with React cache). */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export const getCurrentProfile = cache(async (): Promise<Tables<"profiles"> | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data;
});

/** Mirrors public.is_verified_user(): a confirmed email or phone number. */
export function isVerified(user: { email_confirmed_at?: string | null; phone_confirmed_at?: string | null }) {
  return Boolean(user.email_confirmed_at || user.phone_confirmed_at);
}

/** Accounts created with a temporary password must replace it before anything else. */
export function mustChangePassword(user: { user_metadata?: Record<string, unknown> | null } | null | undefined) {
  return user?.user_metadata?.must_change_password === true;
}

export const FIRST_LOGIN_PATH = "/reset-password?first=1";

/**
 * Where a protected render goes without a verified user. The proxy already sent signed-out visitors
 * to /login, so this means the cookie's token is no longer accepted (revoked, banned, deleted):
 * /auth/revoked clears it first, or /login would bounce straight back.
 */
export function signedOutPath(nextPath: string) {
  return `/auth/revoked?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Redirects to /login when signed out, returns the user + profile otherwise. Accounts still on a
 * temporary password go to the first-login page from every protected render — proxy.ts can't be
 * the only guard, because a Server Action's redirect renders its target without re-entering it.
 */
export async function requireProfile(nextPath = "/tambayan") {
  const user = await getSessionUser();
  if (!user) redirect(signedOutPath(nextPath));
  if (mustChangePassword(user) && nextPath !== "/reset-password") redirect(FIRST_LOGIN_PATH);
  const profile = await getCurrentProfile();
  if (!profile) {
    // The on_auth_user_created trigger should always create one; recover by signing out.
    redirect(`/login?error=${encodeURIComponent("We couldn't find your profile. Sign in again.")}`);
  }
  return { user, profile };
}
