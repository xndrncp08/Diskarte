"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export interface AccountFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const passwordSchema = z
  .object({
    password: z.string().min(8, "Minimum 8 characters").max(72, "Hanggang 72 characters lang"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Hindi magkapareho ang passwords" });

export async function changePasswordAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!limiters.auth.check(`password:${user.id}`).ok) return { error: "Masyadong maraming attempts. Pahinga muna." };

  const parsed = passwordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: friendlyAuthError(error.message) };
  return { ok: true };
}
