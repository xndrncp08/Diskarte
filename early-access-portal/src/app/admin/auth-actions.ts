"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });

async function atLeast<T>(ms: number, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const wait = ms - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * Admin sign-in with a Diskarte account. Non-admins are signed straight back out (same padded
 * timing), so the portal never holds a session for someone without the super_admin role.
 * proxy.ts rate-limits POSTs to /admin/login per IP.
 */
export async function adminSignInAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const result = await atLeast(450, async (): Promise<LoginState | null> => {
    const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
    if (!parsed.success) return { error: "Mali ang email o password." };
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Mali ang email o password." };
    const { data: isAdmin } = await supabase.rpc("is_super_admin");
    if (isAdmin !== true) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: "Walang admin access ang account na 'to." };
    }
    return null;
  });
  if (result) return result;
  redirect(safeRedirectPath(form.get("next")));
}

export async function adminSignOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/login");
}
