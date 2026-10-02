"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors, profileUpdateSchema } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};

export async function updateProfileAction(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const limit = limiters.mutation.check(`profile:${user.id}`);
  if (!limit.ok) return { error: "You're editing too fast. Try again in a moment." };

  const parsed = profileUpdateSchema.safeParse({
    username: text(form, "username"),
    displayName: text(form, "displayName"),
    bio: text(form, "bio"),
    avatarPreset: text(form, "avatarPreset"),
    bannerPreset: text(form, "bannerPreset"),
    avatarUrl: text(form, "avatarUrl"),
    bannerUrl: text(form, "bannerUrl"),
    status: text(form, "status"),
    customStatus: text(form, "customStatus"),
    customStatusEmoji: text(form, "customStatusEmoji"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username: p.username,
      display_name: p.displayName,
      bio: p.bio,
      avatar_preset: p.avatarPreset,
      banner_preset: p.bannerPreset,
      avatar_url: p.avatarUrl ?? null,
      banner_url: p.bannerUrl ?? null,
      status: p.status,
      custom_status: p.customStatus,
      custom_status_emoji: p.customStatusEmoji,
      onboarded: true,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") return { fieldErrors: { username: "That username is taken." } };
    return { error: "Couldn't save your profile. Try again." };
  }

  revalidatePath("/", "layout");
  const redirectTo = text(form, "redirectTo");
  if (redirectTo) redirect(safeRedirectPath(redirectTo));
  return { ok: true };
}

/** Quick status switcher from the user panel (presence + optional custom status). */
export async function setStatusAction(input: { status: string; customStatus?: string | null; customStatusEmoji?: string | null }): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Not signed in" };
  const limit = limiters.mutation.check(`profile:${user.id}`);
  if (!limit.ok) return { error: "Slow down a little." };

  const schema = profileUpdateSchema.pick({ status: true, customStatus: true, customStatusEmoji: true });
  const parsed = schema.safeParse({
    status: input.status,
    customStatus: input.customStatus ?? "",
    customStatusEmoji: input.customStatusEmoji ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: parsed.data.status, custom_status: parsed.data.customStatus, custom_status_emoji: parsed.data.customStatusEmoji })
    .eq("id", user.id);
  if (error) return { error: "Couldn't update your status." };
  revalidatePath("/", "layout");
  return { ok: true };
}
