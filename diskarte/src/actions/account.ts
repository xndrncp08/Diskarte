"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors, passwordSchema } from "@/lib/profile";
import { checkLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export interface AccountFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

/** Change password (settings) or finish a reset (recovery session from the email link). */
export async function changePasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Per-account budget on top of proxy.ts's per-IP limit.
  if (!(await checkLimit("auth", `password:${user.id}`)).ok) return { error: "Too many attempts. Take a short break." };

  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  // Also clears the Early Access "change your temporary password" flag, then refreshes the
  // session so the new JWT (read by proxy.ts) no longer carries it.
  const firstLogin = user.user_metadata?.must_change_password === true;
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password, ...(firstLogin ? { data: { must_change_password: false } } : {}) });
  if (error) return { error: friendlyAuthError(error.message) };
  if (firstLogin) await supabase.auth.refreshSession();

  const next = form.get("redirectTo");
  if (typeof next === "string" && next) redirect(safeRedirectPath(next));
  return { ok: true };
}

/** Supabase Storage removes at most this many objects per request. */
const REMOVE_BATCH = 100;

/**
 * Permanently deletes the signed-in account (Settings → Danger zone). The caller must type their
 * username. Files go first through the Storage API (the database refuses direct deletes), then
 * `delete_my_account` transfers or deletes owned servers and removes the auth user, which cascades
 * to every profile row. Finally the session cookies are cleared.
 */
export async function deleteAccountAction(input: { confirm: string }): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!(await checkLimit("auth", `delete:${user.id}`)).ok) return { error: "Too many attempts. Take a short break." };
  const confirm = typeof input?.confirm === "string" ? input.confirm.trim() : "";
  if (!confirm) return { fieldErrors: { confirm: "Type your username to confirm" } };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (!profile || confirm.replace(/^@/, "").toLowerCase() !== profile.username.toLowerCase()) {
    return { fieldErrors: { confirm: "That doesn't match your username" } };
  }

  const { data: files, error: listError } = await supabase.rpc("account_deletion_files");
  if (listError) return { error: "Couldn't delete your account. Try again." };
  const byBucket = new Map<string, string[]>();
  for (const f of files ?? []) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) return { error: "Couldn't remove your uploaded files, so nothing was deleted. Try again." };
    }
  }

  const { error } = await supabase.rpc("delete_my_account", { p_confirm: profile.username });
  if (error) return { error: error.message.includes("CONFIRMATION_MISMATCH") ? "That doesn't match your username" : "Couldn't delete your account. Try again." };

  // The user is gone, so the API may reject the sign-out call; the local session is cleared regardless.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?deleted=1");
}
