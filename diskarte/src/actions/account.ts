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
