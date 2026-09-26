"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors, isAllowedImageUrl } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { channelSchema, parseInviteInput, serverSchema, uuidSchema } from "@/lib/servers";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
  /** Machine-readable failure reason for callers that react to it (e.g. "SLOWMODE"). */
  code?: string;
  /** Seconds until the action may be retried (slow mode). */
  retryAfter?: number;
}

const DB_ERRORS: Record<string, string> = {
  SERVER_LIMIT_REACHED: "Umabot ka na sa limit na 25 tambayan na pagmamay-ari mo.",
  SERVER_JOIN_LIMIT: "Nasa 100 tambayan ka na — mag-leave muna sa iba.",
  INVITE_NOT_FOUND: "Walang tambayan na may ganyang invite code.",
  OWNER_CANNOT_LEAVE: "Ikaw ang owner — i-delete o i-transfer muna ang tambayan.",
  CANNOT_KICK_MEMBER: "Hindi mo pwedeng i-kick ang member na 'yan.",
  ONLY_ADMINS_CAN_CHANGE_ROLES: "Admins lang ang pwedeng magpalit ng roles.",
  CANNOT_CHANGE_OWNER_ROLE: "Hindi pwedeng palitan ang role ng owner.",
  ONLY_OWNER_CAN_DEMOTE_ADMINS: "Ang owner lang ang pwedeng mag-demote ng admin.",
  ONLY_ADMINS_CAN_REGENERATE_INVITES: "Admins lang ang pwedeng mag-reset ng invite.",
};

function dbError(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  const key = Object.keys(DB_ERRORS).find((k) => message.includes(k));
  if (key) return DB_ERRORS[key];
  if (message.includes("row-level security")) return "Wala kang permiso para gawin 'yan.";
  return fallback;
}

async function authed(bucket: "mutation" = "mutation") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const limit = limiters[bucket].check(`${bucket}:${user.id}`);
  return { user, limited: !limit.ok };
}

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Dahan-dahan lang, kabayan. Subukan ulit mamaya." };

// ---------------------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------------------

export async function createServerAction(input: { name: string; description?: string }): Promise<ActionResult<{ serverId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = serverSchema.safeParse({ name: input.name, description: input.description ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_server", { p_name: parsed.data.name, p_description: parsed.data.description });
  if (error || !data) return { ok: false, error: dbError(error?.message, "Hindi nagawa ang tambayan. Subukan ulit.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true, data: { serverId: data } };
}

export async function joinServerAction(input: { invite: string }): Promise<ActionResult<{ serverId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const code = parseInviteInput(input.invite);
  if (!code) return { ok: false, fieldErrors: { invite: "Invalid invite — 10 characters o buong invite link." } };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_server", { p_code: code });
  if (error || !data) return { ok: false, error: dbError(error?.message, "Hindi naka-join. Subukan ulit.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true, data: { serverId: data } };
}

export async function updateServerAction(input: { serverId: string; name: string; description: string; iconUrl?: string | null }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const parsed = serverSchema.safeParse({ name: input.name, description: input.description });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (input.iconUrl && !isAllowedImageUrl(input.iconUrl)) return { ok: false, fieldErrors: { icon: "Invalid icon URL" } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servers")
    .update({ name: parsed.data.name, description: parsed.data.description, ...(input.iconUrl !== undefined ? { icon_url: input.iconUrl } : {}) })
    .eq("id", input.serverId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Admins lang ang pwedeng mag-edit ng tambayan.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function deleteServerAction(input: { serverId: string; confirmName: string }): Promise<ActionResult> {
  const { user, limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { data: server } = await supabase.from("servers").select("name, owner_id").eq("id", input.serverId).maybeSingle();
  if (!server || server.owner_id !== user.id) return { ok: false, error: "Ang owner lang ang pwedeng mag-delete." };
  if (server.name.trim() !== input.confirmName.trim()) return { ok: false, fieldErrors: { confirmName: "Hindi tugma ang pangalan." } };
  const { error } = await supabase.from("servers").delete().eq("id", input.serverId);
  if (error) return { ok: false, error: dbError(error.message, "Hindi na-delete ang tambayan.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function leaveServerAction(input: { serverId: string }): Promise<ActionResult> {
  const { user, limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("server_id", input.serverId).eq("user_id", user.id);
  if (error) return { ok: false, error: dbError(error.message, "Hindi naka-leave.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function regenerateInviteAction(input: { serverId: string }): Promise<ActionResult<{ code: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_invite", { p_server_id: input.serverId });
  if (error || !data) return { ok: false, error: dbError(error?.message, "Hindi na-reset ang invite.") };
  return { ok: true, data: { code: data } };
}

// ---------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------

export async function createChannelAction(input: { serverId: string; name: string; type: "text" | "voice"; category: string; topic?: string }): Promise<ActionResult<{ channelId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const parsed = channelSchema.safeParse({ name: input.name, type: input.type, category: input.category, topic: input.topic ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: last } = await supabase.from("channels").select("position").eq("server_id", input.serverId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("channels")
    .insert({ server_id: input.serverId, ...parsed.data, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: dbError(error?.message, "Hindi nagawa ang channel.") };
  return { ok: true, data: { channelId: data.id } };
}

export async function updateChannelAction(input: { channelId: string; name: string; type: "text" | "voice"; category: string; topic: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.channelId).success) return { ok: false, error: "Invalid channel" };
  const parsed = channelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .update({ name: parsed.data.name, category: parsed.data.category, topic: parsed.data.topic })
    .eq("id", input.channelId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Moderators lang ang pwedeng mag-edit ng channel.") };
  return { ok: true };
}

export async function deleteChannelAction(input: { channelId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.channelId).success) return { ok: false, error: "Invalid channel" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").delete().eq("id", input.channelId).select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Moderators lang ang pwedeng mag-delete ng channel.") };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Members (RBAC)
// ---------------------------------------------------------------------------------------

const roleSchema = z.enum(["member", "moderator", "admin"]);

export async function setMemberRoleAction(input: { serverId: string; userId: string; role: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const role = roleSchema.safeParse(input.role);
  if (!role.success || !uuidSchema.safeParse(input.serverId).success || !uuidSchema.safeParse(input.userId).success) {
    return { ok: false, error: "Invalid request" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .update({ role: role.data })
    .eq("server_id", input.serverId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Hindi napalitan ang role.") };
  return { ok: true };
}

export async function kickMemberAction(input: { serverId: string; userId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success || !uuidSchema.safeParse(input.userId).success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").delete().eq("server_id", input.serverId).eq("user_id", input.userId).select("user_id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Hindi mo pwedeng i-kick ang member na 'yan.") };
  return { ok: true };
}

export async function setNicknameAction(input: { serverId: string; userId: string; nickname: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const nickname = input.nickname.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (nickname.length > 32) return { ok: false, fieldErrors: { nickname: "Hanggang 32 characters lang" } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .update({ nickname: nickname || null })
    .eq("server_id", input.serverId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Hindi napalitan ang nickname.") };
  return { ok: true };
}
