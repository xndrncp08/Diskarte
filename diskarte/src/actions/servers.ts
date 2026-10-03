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
  SERVER_LIMIT_REACHED: "You've reached the limit of 25 servers you can own.",
  SERVER_JOIN_LIMIT: "You're in 100 servers already — leave one first.",
  INVITE_NOT_FOUND: "No server has that invite code.",
  BANNED: "You're banned from this server.",
  OWNER_CANNOT_LEAVE: "You own this server — delete it or transfer ownership first.",
  CANNOT_LEAVE_SYSTEM_SERVER: "Everyone stays in Diskarte HQ — it's where announcements live.",
  SYSTEM_SERVER_IMMUTABLE: "Diskarte HQ is managed by the Diskarte team.",
  CANNOT_KICK_MEMBER: "You can't kick that member.",
  ONLY_ADMINS_CAN_CHANGE_ROLES: "Only admins can change roles.",
  CANNOT_CHANGE_OWNER_ROLE: "The owner's role can't be changed.",
  ONLY_OWNER_CAN_DEMOTE_ADMINS: "Only the owner can demote an admin.",
  ONLY_ADMINS_CAN_REGENERATE_INVITES: "Only admins can reset the invite.",
};

function dbError(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  const key = Object.keys(DB_ERRORS).find((k) => message.includes(k));
  if (key) return DB_ERRORS[key];
  if (message.includes("row-level security")) return "You don't have permission to do that.";
  return fallback;
}

async function authed(bucket: "mutation" = "mutation") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const limit = limiters[bucket].check(`${bucket}:${user.id}`);
  return { user, limited: !limit.ok };
}

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Slow down a little. Try again in a moment." };

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
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't create the server. Try again.") };
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
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't join. Try again.") };
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
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only admins can edit the server.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function deleteServerAction(input: { serverId: string; confirmName: string }): Promise<ActionResult> {
  const { user, limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { data: server } = await supabase.from("servers").select("name, owner_id").eq("id", input.serverId).maybeSingle();
  if (!server || server.owner_id !== user.id) return { ok: false, error: "Only the owner can delete the server." };
  if (server.name.trim() !== input.confirmName.trim()) return { ok: false, fieldErrors: { confirmName: "The name doesn't match." } };
  const { error } = await supabase.from("servers").delete().eq("id", input.serverId);
  if (error) return { ok: false, error: dbError(error.message, "Couldn't delete the server.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function leaveServerAction(input: { serverId: string }): Promise<ActionResult> {
  const { user, limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("server_id", input.serverId).eq("user_id", user.id);
  if (error) return { ok: false, error: dbError(error.message, "Couldn't leave.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

export async function regenerateInviteAction(input: { serverId: string }): Promise<ActionResult<{ code: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_invite", { p_server_id: input.serverId });
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't reset the invite.") };
  return { ok: true, data: { code: data } };
}

// ---------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------

export async function createChannelAction(input: {
  serverId: string;
  name: string;
  type: "text" | "voice";
  category: string;
  topic?: string;
  slowmodeSeconds?: number;
  requiresVerification?: boolean;
  readOnly?: boolean;
}): Promise<ActionResult<{ channelId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const parsed = channelSchema.safeParse({ name: input.name, type: input.type, category: input.category, topic: input.topic ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const moderation = channelModerationSchema.safeParse(input);
  if (!moderation.success) return { ok: false, fieldErrors: { slowmodeSeconds: "Invalid slow mode" } };

  const supabase = await createClient();
  const { data: last } = await supabase.from("channels").select("position").eq("server_id", input.serverId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("channels")
    .insert({
      server_id: input.serverId,
      ...parsed.data,
      position: (last?.position ?? -1) + 1,
      slowmode_seconds: moderation.data.slowmodeSeconds,
      requires_verification: moderation.data.requiresVerification,
      read_only: moderation.data.readOnly,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't create the channel.") };
  return { ok: true, data: { channelId: data.id } };
}

const channelModerationSchema = z.object({
  slowmodeSeconds: z.number().int().min(0).max(21600).default(0),
  requiresVerification: z.boolean().default(false),
  /** Announcements-style: only admins can post. */
  readOnly: z.boolean().default(false),
});

export async function updateChannelAction(input: {
  channelId: string;
  name: string;
  type: "text" | "voice";
  category: string;
  topic: string;
  slowmodeSeconds?: number;
  requiresVerification?: boolean;
  readOnly?: boolean;
}): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.channelId).success) return { ok: false, error: "Invalid channel" };
  const parsed = channelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const moderation = channelModerationSchema.safeParse(input);
  if (!moderation.success) return { ok: false, fieldErrors: { slowmodeSeconds: "Invalid slow mode" } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channels")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      topic: parsed.data.topic,
      slowmode_seconds: moderation.data.slowmodeSeconds,
      requires_verification: moderation.data.requiresVerification,
      read_only: moderation.data.readOnly,
    })
    .eq("id", input.channelId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only moderators can edit channels.") };
  return { ok: true };
}

export async function deleteChannelAction(input: { channelId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.channelId).success) return { ok: false, error: "Invalid channel" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("channels").delete().eq("id", input.channelId).select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only moderators can delete channels.") };
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
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Couldn't change the role.") };
  return { ok: true };
}

export async function kickMemberAction(input: { serverId: string; userId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success || !uuidSchema.safeParse(input.userId).success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("members").delete().eq("server_id", input.serverId).eq("user_id", input.userId).select("user_id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "You can't kick that member.") };
  return { ok: true };
}

export async function setNicknameAction(input: { serverId: string; userId: string; nickname: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const nickname = input.nickname.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (nickname.length > 32) return { ok: false, fieldErrors: { nickname: "32 characters max" } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .update({ nickname: nickname || null })
    .eq("server_id", input.serverId)
    .eq("user_id", input.userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Couldn't change the nickname.") };
  return { ok: true };
}
