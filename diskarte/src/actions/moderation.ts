"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { automodSettingsSchema, communityError, supportSettingsSchema } from "@/lib/community";
import { fieldErrors } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Slow down a little. Try again in a moment." };

async function authed() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { user, limited: !limiters.mutation.check(`mutation:${user.id}`).ok };
}

const ids = z.object({ serverId: z.uuid() });
const memberIds = ids.extend({ userId: z.uuid() });

// ---------------------------------------------------------------------------------------
// Bantay-Bayan settings (admins)
// ---------------------------------------------------------------------------------------

export async function updateAutomodAction(input: { serverId: string; enabled: boolean; categories: string[]; customTerms: string[] }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const server = ids.safeParse(input);
  const parsed = automodSettingsSchema.safeParse(input);
  if (!server.success) return { ok: false, error: "Invalid server" };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servers")
    .update({ automod_enabled: parsed.data.enabled, automod_categories: parsed.data.categories, automod_custom_terms: parsed.data.customTerms })
    .eq("id", server.data.serverId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only admins can configure auto-mod.") };
  return { ok: true };
}

export async function updateSupportAction(input: { serverId: string; gcashNumber: string; mayaNumber: string; supportNote: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const server = ids.safeParse(input);
  const parsed = supportSettingsSchema.safeParse(input);
  if (!server.success) return { ok: false, error: "Invalid server" };
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servers")
    .update({ gcash_number: parsed.data.gcashNumber, maya_number: parsed.data.mayaNumber, support_note: parsed.data.supportNote })
    .eq("id", server.data.serverId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only admins can edit this.") };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Bans (moderators)
// ---------------------------------------------------------------------------------------

export async function banMemberAction(input: { serverId: string; userId: string; reason?: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = memberIds.extend({ reason: z.string().max(200, "200 characters max").default("") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ban_member", { p_server_id: parsed.data.serverId, p_user_id: parsed.data.userId, p_reason: parsed.data.reason.trim() });
  if (error) return { ok: false, error: communityError(error.message, "Couldn't ban.") };
  return { ok: true };
}

export async function unbanMemberAction(input: { serverId: string; userId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = memberIds.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unban_member", { p_server_id: parsed.data.serverId, p_user_id: parsed.data.userId });
  if (error) return { ok: false, error: communityError(error.message, "Couldn't unban.") };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Supporter badges (admins)
// ---------------------------------------------------------------------------------------

export async function setBadgeAction(input: { serverId: string; userId: string; badge: string; on: boolean }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = memberIds.extend({ badge: z.enum(["booster", "lodi_supporter", "gcash_contributor"]), on: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { serverId, userId, badge, on } = parsed.data;
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from("server_badges").upsert({ server_id: serverId, user_id: userId, badge }, { onConflict: "server_id,user_id,badge", ignoreDuplicates: true })
    : await supabase.from("server_badges").delete().eq("server_id", serverId).eq("user_id", userId).eq("badge", badge);
  if (error) return { ok: false, error: communityError(error.message, "Only admins can give badges.") };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Soundboard (admins). The browser uploads the MP3 straight to the private `soundboard` bucket
// (storage policies check admin + the `<server>/<uuid>.mp3` name); this registers it.
// ---------------------------------------------------------------------------------------

const clipSchema = ids.extend({
  name: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(1, "Add a name").max(32, "32 characters max")),
  emoji: z
    .string()
    .trim()
    .max(16)
    .transform((v) => v || "🔊"),
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/, "Invalid path"),
});

export async function addSoundboardClipAction(input: { serverId: string; name: string; emoji: string; path: string }): Promise<ActionResult<{ id: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = clipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), error: parsed.error.issues[0]?.message };
  if (!parsed.data.path.startsWith(`${parsed.data.serverId}/`)) return { ok: false, error: "Invalid path" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("soundboard_clips")
    .insert({ server_id: parsed.data.serverId, name: parsed.data.name, emoji: parsed.data.emoji, storage_path: parsed.data.path })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from("soundboard").remove([parsed.data.path]);
    return { ok: false, error: communityError(error?.message, "Couldn't save the sound.") };
  }
  return { ok: true, data: { id: data.id } };
}

export async function removeSoundboardClipAction(input: { clipId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = z.object({ clipId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid clip" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("soundboard_clips").delete().eq("id", parsed.data.clipId).select("storage_path");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only admins can remove sounds.") };
  await supabase.storage.from("soundboard").remove([data[0].storage_path]);
  return { ok: true };
}
