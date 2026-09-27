"use server";

import { redirect } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { credentialsSchema, emailSchema, enabledOAuthProviders, fieldErrors, signUpSchema, type OAuthProvider } from "@/lib/profile";
import { safeRedirectPath, withMinimumDuration } from "@/lib/security";
import { signupPolicy } from "@/lib/signup-mode";
import { createClient } from "@/lib/supabase/server";

// Brute-force protection: proxy.ts rate-limits every POST to the auth pages per client IP
// (HTTP 429 + Retry-After) before these actions run. Responses are padded to a constant floor
// so success, failure and unknown-account paths are indistinguishable by timing.
const AUTH_MIN_DURATION_MS = 450;

export interface AuthFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form, "email") };
  const result = await withMinimumDuration(AUTH_MIN_DURATION_MS, async (): Promise<AuthFormState | null> => {
    const parsed = credentialsSchema.safeParse({ email: text(form, "email"), password: text(form, "password") });
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    // One message for "no such user" and "wrong password" (no account enumeration).
    if (error) return { error: friendlyAuthError(error.message), values };
    return null;
  });
  if (result) return result;
  redirect(safeRedirectPath(text(form, "next")));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form, "email"), username: text(form, "username"), displayName: text(form, "displayName") };
  if (signupPolicy().inviteOnly) return { error: "Early Access pa lang ang Diskarte — mag-apply muna sa waitlist.", values };
  const result = await withMinimumDuration(AUTH_MIN_DURATION_MS, async (): Promise<AuthFormState | "session"> => {
    const parsed = signUpSchema.safeParse({
      email: text(form, "email"),
      password: text(form, "password"),
      confirmPassword: text(form, "confirmPassword"),
      username: text(form, "username"),
      displayName: text(form, "displayName"),
    });
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

    const supabase = await createClient();
    const { data: available } = await supabase.rpc("username_available", { p_username: parsed.data.username });
    if (available === false) return { fieldErrors: { username: "May gumagamit na ng username na 'yan." }, values };

    const { siteUrl } = getPublicEnv();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
        data: { username: parsed.data.username, display_name: parsed.data.displayName },
      },
    });
    if (error) return { error: friendlyAuthError(error.message), values };
    if (data.session) return "session";
    // With email confirmation on, Supabase answers identically for new and existing emails.
    return { notice: `Check mo ang inbox ng ${parsed.data.email} — nag-send kami ng confirmation link para ma-activate ang account mo.`, values };
  });
  if (result === "session") redirect("/onboarding");
  return result;
}

export async function signInWithProviderAction(form: FormData): Promise<void> {
  const provider = text(form, "provider") as OAuthProvider;
  const next = safeRedirectPath(text(form, "next"));
  if (!enabledOAuthProviders().includes(provider)) {
    redirect(`/login?error=${encodeURIComponent("Hindi naka-enable ang provider na 'yan.")}`);
  }
  const { siteUrl } = getPublicEnv();
  const supabase = await createClient();
  // PKCE: @supabase/ssr stores the code verifier in a cookie; /auth/callback exchanges it.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error?.message ?? ""))}`);
  }
  redirect(data.url);
}

/** Always answers the same way so the form can't be used to discover which emails have accounts. */
export async function requestPasswordResetAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form, "email") };
  return withMinimumDuration(AUTH_MIN_DURATION_MS, async () => {
    const email = emailSchema.safeParse(text(form, "email"));
    if (!email.success) return { fieldErrors: { email: email.error.issues[0]?.message ?? "Mukhang mali ang email" }, values };
    const { siteUrl } = getPublicEnv();
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${siteUrl}/auth/callback?next=/reset-password` });
    return { notice: "Kung may account ang email na 'yan, nag-send kami ng link para mag-reset ng password.", values };
  });
}

/** Sign out this browser, or every device when `scope=global` (revokes all refresh tokens). */
export async function signOutAction(form: FormData): Promise<void> {
  const scope = text(form, "scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect("/login");
}
