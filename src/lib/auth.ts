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

/** Redirects to /login when signed out, returns the user + profile otherwise. */
export async function requireProfile(nextPath = "/tambayan") {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const profile = await getCurrentProfile();
  if (!profile) {
    // The on_auth_user_created trigger should always create one; recover by signing out.
    redirect(`/login?error=${encodeURIComponent("Hindi mahanap ang profile mo. Mag-log in ulit.")}`);
  }
  return { user, profile };
}
