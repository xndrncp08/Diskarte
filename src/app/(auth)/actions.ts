"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { credentialsSchema, enabledOAuthProviders, fieldErrors, signUpSchema, type OAuthProvider } from "@/lib/profile";
import { clientIp, limiters } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

async function rateLimited(): Promise<string | null> {
  const ip = clientIp(await headers());
  const result = limiters.auth.check(`auth:${ip}`);
  if (result.ok) return null;
  return `Dahan-dahan lang, kabayan. Subukan ulit in ${Math.ceil(result.retryAfterMs / 1000)}s.`;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form, "email") };
  const limited = await rateLimited();
  if (limited) return { error: limited, values };

  const parsed = credentialsSchema.safeParse({ email: text(form, "email"), password: text(form, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyAuthError(error.message), values };

  redirect(safeRedirectPath(text(form, "next")));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form, "email"), username: text(form, "username"), displayName: text(form, "displayName") };
  const limited = await rateLimited();
  if (limited) return { error: limited, values };

  const parsed = signUpSchema.safeParse({
    email: text(form, "email"),
    password: text(form, "password"),
    username: text(form, "username"),
    displayName: text(form, "displayName"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data: available } = await supabase.rpc("username_available", { p_username: parsed.data.username });
  if (available === false) {
    return { fieldErrors: { username: "May gumagamit na ng username na 'yan." }, values };
  }

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

  if (!data.session) {
    return {
      notice: `Check mo ang inbox ng ${parsed.data.email} — nag-send kami ng confirmation link para ma-activate ang account mo.`,
      values,
    };
  }
  redirect("/onboarding");
}

export async function signInWithProviderAction(form: FormData): Promise<void> {
  const provider = text(form, "provider") as OAuthProvider;
  const next = safeRedirectPath(text(form, "next"));
  if (!enabledOAuthProviders().includes(provider)) {
    redirect(`/login?error=${encodeURIComponent("Hindi naka-enable ang provider na 'yan.")}`);
  }
  const limited = await rateLimited();
  if (limited) redirect(`/login?error=${encodeURIComponent(limited)}`);

  const { siteUrl } = getPublicEnv();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(friendlyAuthError(error?.message ?? ""))}`);
  }
  redirect(data.url);
}

/** Sign out this browser, or every device when `scope=global` (revokes all refresh tokens). */
export async function signOutAction(form: FormData): Promise<void> {
  const scope = text(form, "scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  redirect("/login");
}
