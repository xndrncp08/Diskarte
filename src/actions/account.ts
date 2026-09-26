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
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Hindi magkapareho ang passwords" });

/** Change password (settings) or finish a reset (recovery session from the email link). */
export async function changePasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Per-account budget on top of proxy.ts's per-IP limit.
  if (!(await checkLimit("auth", `password:${user.id}`)).ok) return { error: "Masyadong maraming attempts. Pahinga muna." };

  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendlyAuthError(error.message) };

  const next = form.get("redirectTo");
  if (typeof next === "string" && next) redirect(safeRedirectPath(next));
  return { ok: true };
}
