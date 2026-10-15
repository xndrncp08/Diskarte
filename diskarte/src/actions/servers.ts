"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { fieldErrors, isAllowedImageUrl } from "@/lib/profile";
import { limiters } from "@/lib/rate-limit";
import { INVITE_AGES, INVITE_USES, parseInviteInput, SERVER_CATEGORIES, type Channel } from "@/lib/servers";
import { channelSchema, serverSchema, uuidSchema } from "@/lib/schemas/servers";
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
  INVITE_NOT_FOUND: "That invite is invalid or has expired.",
  CANNOT_CREATE_INVITE: "You can't create invites for this server.",
  INVALID_INVITE_SETTINGS: "Pick an expiry and a use limit.",
  TOO_MANY_INVITES: "This server has too many active invites. Revoke some first.",
  CANNOT_REVOKE_INVITE: "You can only revoke your own invites.",
  BANNED: "You're banned from this server.",
  OWNER_CANNOT_LEAVE: "You own this server — delete it or transfer ownership first.",
  CANNOT_LEAVE_SYSTEM_SERVER: "Everyone stays in Diskarte HQ — it's where announcements live.",
  SYSTEM_SERVER_IMMUTABLE: "Diskarte HQ is managed by the Diskarte team.",
  CANNOT_KICK_MEMBER: "You can't kick that member.",
  ONLY_OWNER_CAN_TRANSFER: "Only the owner can transfer the server.",
  NEW_OWNER_MUST_BE_MEMBER: "They need to be in the server first.",
  ONLY_ADMINS_CAN_CHANGE_ROLES: "Only admins can change roles.",
  CANNOT_CHANGE_OWNER_ROLE: "The owner's role can't be changed.",
  ONLY_OWNER_CAN_DEMOTE_ADMINS: "Only the owner can demote an admin.",
  ONLY_ADMINS_CAN_REGENERATE_INVITES: "Only admins can reset the invite.",
  ONLY_ADMINS_CHANGE_PRIVACY: "Only admins can make a channel private or public.",
  server_roles_name_idx: "There's already a role with that name.",
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

export async function createServerAction(input: { name: string; description?: string; template?: string }): Promise<ActionResult<{ serverId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = serverSchema.safeParse({ name: input.name, description: input.description ?? "" });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const template = z.enum(["gaming", "study", "creator", "friends", "team"]).safeParse(input.template ?? "gaming");
  if (!template.success) return { ok: false, error: "Choose an available community template." };

  const supabase = await createClient();
  const args = { p_name: parsed.data.name, p_description: parsed.data.description };
  const { data, error } = template.data === "gaming" ? await supabase.rpc("create_server", args) : await supabase.rpc("create_server_from_template", { ...args, p_template: template.data });
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

export async function updateServerAction(input: { serverId: string; name: string; description: string; iconUrl?: string | null; isPublic?: boolean; category?: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const parsed = serverSchema.safeParse({ name: input.name, description: input.description });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  if (input.iconUrl && !isAllowedImageUrl(input.iconUrl)) return { ok: false, fieldErrors: { icon: "Invalid icon URL" } };
  if (input.category !== undefined && !SERVER_CATEGORIES.some((c) => c.id === input.category)) return { ok: false, fieldErrors: { category: "Pick a category" } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servers")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      ...(input.iconUrl !== undefined ? { icon_url: input.iconUrl } : {}),
      // Only sent when changed, so saving works before the discovery migration is applied.
      ...(input.isPublic !== undefined ? { is_public: input.isPublic } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
    })
    .eq("id", input.serverId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only admins can edit the server.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

/** Join a server listed in Explore (no invite needed). */
export async function joinPublicServerAction(input: { serverId: string }): Promise<ActionResult<{ serverId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_public_server", { p_server: input.serverId });
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't join. Try again.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true, data: { serverId: data } };
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

/** Discord's Transfer Ownership: the owner hands the server to another member (who becomes an admin). */
export async function transferOwnershipAction(input: { serverId: string; userId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success || !uuidSchema.safeParse(input.userId).success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("servers").update({ owner_id: input.userId }).eq("id", input.serverId).select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only the owner can transfer the server.") };
  revalidatePath("/tambayan", "layout");
  return { ok: true };
}

/** An extra invite link that expires and/or stops after a number of uses. Any member can make one. */
export async function createInviteAction(input: { serverId: string; maxAgeMinutes: number; maxUses: number }): Promise<ActionResult<{ code: string; expiresAt: string | null }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = z
    .object({
      serverId: uuidSchema,
      maxAgeMinutes: z.number().refine((m) => INVITE_AGES.some((a) => a.minutes === m)),
      maxUses: z.number().refine((u) => (INVITE_USES as readonly number[]).includes(u)),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick an expiry and a use limit." };
  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("create_invite", { p_server: parsed.data.serverId, p_max_age_minutes: parsed.data.maxAgeMinutes, p_max_uses: parsed.data.maxUses });
  if (error || !code) return { ok: false, error: dbError(error?.message, "Couldn't create the invite.") };
  const { data: row } = await supabase.from("server_invites").select("expires_at").eq("code", code).maybeSingle();
  return { ok: true, data: { code, expiresAt: row?.expires_at ?? null } };
}

export async function revokeInviteAction(input: { code: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!/^[A-Z0-9]{6,16}$/.test(input.code)) return { ok: false, error: "Invalid invite" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_code: input.code });
  if (error) return { ok: false, error: dbError(error.message, "Couldn't revoke the invite.") };
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
  type: "text" | "voice" | "forum";
  category: string;
  topic?: string;
  slowmodeSeconds?: number;
  requiresVerification?: boolean;
  readOnly?: boolean;
  /** Admins only (the database refuses anyone else). */
  isPrivate?: boolean;
}): Promise<ActionResult<{ channelId: string; channel: Channel }>> {
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
      // Only sent when set, so creating public channels never depends on the column.
      ...(input.isPrivate ? { is_private: true } : {}),
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: dbError(error?.message, "Couldn't create the channel.") };
  // The row comes back so the creator's sidebar shows it at once (others get it over realtime).
  return { ok: true, data: { channelId: data.id, channel: data } };
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
  type: "text" | "voice" | "forum";
  category: string;
  topic: string;
  slowmodeSeconds?: number;
  requiresVerification?: boolean;
  readOnly?: boolean;
  /** Only when it changes; admins only. */
  isPrivate?: boolean;
}): Promise<ActionResult<{ channel: Channel }>> {
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
      ...(typeof input.isPrivate === "boolean" ? { is_private: input.isPrivate } : {}),
    })
    .eq("id", input.channelId)
    .select("*");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only moderators can edit channels.") };
  return { ok: true, data: { channel: data[0] } };
}

const reorderSchema = z.object({ serverId: uuidSchema, channelIds: z.array(uuidSchema).min(1).max(500) });

/** Saves the sidebar order: `channelIds` is every channel of the server, top to bottom. Moderators only (RLS). */
export async function reorderChannelsAction(input: { serverId: string; channelIds: string[] }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid channel order" };
  const { serverId, channelIds } = parsed.data;
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("channels").select("id, position").eq("server_id", serverId);
  if (readError || !current) return { ok: false, error: "Couldn't reorder the channels." };
  const positions = new Map(current.map((c) => [c.id, c.position]));
  if (channelIds.length !== positions.size || new Set(channelIds).size !== channelIds.length || !channelIds.every((id) => positions.has(id))) {
    return { ok: false, error: "The channel list changed. Try again." };
  }
  // shortcut: one UPDATE per moved channel, not one transaction; fine for a sidebar's worth of rows (RLS makes them all fail together).
  const moved = channelIds.flatMap((id, position) => (positions.get(id) === position ? [] : [{ id, position }]));
  const results = await Promise.all(moved.map(({ id, position }) => supabase.from("channels").update({ position }).eq("id", id).eq("server_id", serverId).select("id")));
  const failed = results.find((r) => r.error || !r.data?.length);
  if (failed) return { ok: false, error: dbError(failed.error?.message, "Only moderators can reorder channels.") };
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

// ---------------------------------------------------------------------------------------
// Custom roles and private channel access (admins only; RLS enforces it)
// ---------------------------------------------------------------------------------------

const customRoleSchema = z.object({
  name: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(1, "Give the role a name").max(32, "32 characters max")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
});

export async function createRoleAction(input: { serverId: string; name: string; color: string }): Promise<ActionResult<{ roleId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.serverId).success) return { ok: false, error: "Invalid server" };
  const parsed = customRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: last } = await supabase.from("server_roles").select("position").eq("server_id", input.serverId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("server_roles")
    .insert({ server_id: input.serverId, ...parsed.data, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: dbError(error?.message, "Only admins can create roles.") };
  return { ok: true, data: { roleId: data.id } };
}

export async function updateRoleAction(input: { roleId: string; name: string; color: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.roleId).success) return { ok: false, error: "Invalid role" };
  const parsed = customRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("server_roles").update(parsed.data).eq("id", input.roleId).select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only admins can edit roles.") };
  return { ok: true };
}

export async function deleteRoleAction(input: { roleId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (!uuidSchema.safeParse(input.roleId).success) return { ok: false, error: "Invalid role" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("server_roles").delete().eq("id", input.roleId).select("id");
  if (error || !data?.length) return { ok: false, error: dbError(error?.message, "Only admins can delete roles.") };
  return { ok: true };
}

/** Gives a member a custom role, or takes it away. */
export async function assignRoleAction(input: { serverId: string; userId: string; roleId: string; assigned: boolean }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  if (![input.serverId, input.userId, input.roleId].every((id) => uuidSchema.safeParse(id).success)) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = input.assigned
    ? await supabase.from("member_roles").upsert({ server_id: input.serverId, user_id: input.userId, role_id: input.roleId }, { onConflict: "role_id,user_id", ignoreDuplicates: true })
    : await supabase.from("member_roles").delete().eq("role_id", input.roleId).eq("user_id", input.userId);
  if (error) return { ok: false, error: dbError(error.message, "Only admins can hand out roles.") };
  return { ok: true };
}

const accessSchema = z.object({
  channelId: uuidSchema,
  serverId: uuidSchema,
  userIds: z.array(uuidSchema).max(500),
  roleIds: z.array(uuidSchema).max(250),
});

/** Sets exactly who (people and roles) may see a private channel; admins always can. */
export async function setChannelAccessAction(input: z.input<typeof accessSchema>): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { channelId, serverId, userIds, roleIds } = parsed.data;
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("channel_access").select("id, user_id, role_id").eq("channel_id", channelId);
  if (readError || !current) return { ok: false, error: dbError(readError?.message, "Only admins can change who's in a private channel.") };
  const wantUsers = new Set(userIds);
  const wantRoles = new Set(roleIds);
  const stale = current.filter((a) => (a.user_id ? !wantUsers.has(a.user_id) : !wantRoles.has(a.role_id!))).map((a) => a.id);
  const added = [
    ...[...wantUsers].filter((id) => !current.some((a) => a.user_id === id)).map((user_id) => ({ channel_id: channelId, server_id: serverId, user_id })),
    ...[...wantRoles].filter((id) => !current.some((a) => a.role_id === id)).map((role_id) => ({ channel_id: channelId, server_id: serverId, role_id })),
  ];
  if (stale.length) {
    const { error } = await supabase.from("channel_access").delete().in("id", stale);
    if (error) return { ok: false, error: dbError(error.message, "Couldn't update who's in the channel.") };
  }
  if (added.length) {
    const { error } = await supabase.from("channel_access").insert(added);
    if (error) return { ok: false, error: dbError(error.message, "Couldn't update who's in the channel.") };
  }
  return { ok: true };
}
