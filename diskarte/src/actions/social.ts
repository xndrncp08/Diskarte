"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError } from "@/lib/community";
import { attachmentSchema, messageContentSchema } from "@/lib/schemas/messages";
import { MAX_ATTACHMENTS, parseAttachments } from "@/lib/messages";
import { limiters } from "@/lib/rate-limit";
import { isStickerId } from "@/lib/stickers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { ActionResult } from "./servers";

const RATE_LIMITED: ActionResult<never> = { ok: false, error: "Slow down a little. Try again in a moment.", code: "RATE_LIMITED" };

async function authed(bucket: "mutation" | "message" = "mutation") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return { user, limited: !limiters[bucket].check(`${bucket}:${user.id}`).ok };
}

const userId = z.object({ userId: z.uuid() });
const conversationId = z.object({ conversationId: z.uuid() });

// ---------------------------------------------------------------------------------------
// Friends & blocks
// ---------------------------------------------------------------------------------------

export async function sendFriendRequestAction(input: { username: string }): Promise<ActionResult<{ status: "pending" | "accepted" }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const username = z
    .string()
    .transform((v) => v.trim().replace(/^@/, "").toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9_.]{3,32}$/, "Username: 3–32 letters, numbers, _ o ."))
    .safeParse(input.username);
  if (!username.success) return { ok: false, fieldErrors: { username: username.error.issues[0]?.message ?? "Invalid username" } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_username: username.data });
  if (error || !data) return { ok: false, fieldErrors: { username: communityError(error?.message, "Couldn't send the friend request.") } };
  return { ok: true, data: { status: data } };
}

export async function respondFriendRequestAction(input: { userId: string; accept: boolean }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = userId.extend({ accept: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_friend_request", { p_user_id: parsed.data.userId, p_accept: parsed.data.accept });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

export async function removeFriendAction(input: { userId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = userId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_friend", { p_user_id: parsed.data.userId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

export async function blockUserAction(input: { userId: string; block: boolean }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = userId.extend({ block: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { error } = parsed.data.block
    ? await supabase.rpc("block_user", { p_user_id: parsed.data.userId })
    : await supabase.rpc("unblock_user", { p_user_id: parsed.data.userId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------------------

export async function openDmAction(input: { userId: string }): Promise<ActionResult<{ conversationId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = userId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_dm", { p_user_id: parsed.data.userId });
  if (error || !data) return { ok: false, error: communityError(error?.message, "Couldn't open the DM.") };
  return { ok: true, data: { conversationId: data } };
}

export async function createGroupDmAction(input: { userIds: string[]; name: string }): Promise<ActionResult<{ conversationId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = z
    .object({
      userIds: z.array(z.uuid()).min(2, "Pick at least 2 friends.").max(9, "Up to 9 friends (10 including you)."),
      name: z
        .string()
        .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, "").trim())
        .pipe(z.string().max(64, "64 characters max")),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group_dm", { p_user_ids: parsed.data.userIds, p_name: parsed.data.name || null });
  if (error || !data) return { ok: false, error: communityError(error?.message, "Couldn't create the group DM.") };
  return { ok: true, data: { conversationId: data } };
}

export async function leaveDmAction(input: { conversationId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = conversationId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid conversation" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_dm", { p_conversation_id: parsed.data.conversationId });
  if (error) return { ok: false, error: communityError(error.message) };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Hangouts: temporary group conversations (migration 20261108000000)
// ---------------------------------------------------------------------------------------

function hangoutError(message: string | undefined, fallback: string) {
  if (message?.includes("RATE_LIMITED")) return "You're already hosting 3 hangouts. End one first.";
  if (message?.includes("NOT_HANGOUT_HOST")) return "Only the host can do that.";
  if (message?.includes("HANGOUT_NOT_FOUND")) return "This hangout has ended.";
  if (message?.includes("INVALID_GROUP_SIZE")) return "Pick 1 to 9 friends.";
  return communityError(message, fallback);
}

const hangoutSchema = z.object({
  userIds: z.array(z.uuid()).min(1, "Pick at least 1 friend.").max(9, "Up to 9 friends (10 including you)."),
  name: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(64, "64 characters max")),
  topic: z.enum(["hangout", "gaming", "study", "project", "watch", "create"]),
  hours: z.number().int().min(1).max(24),
});

export async function createHangoutAction(input: z.input<typeof hangoutSchema>): Promise<ActionResult<{ conversationId: string }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = hangoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_hangout", { p_user_ids: parsed.data.userIds, p_name: parsed.data.name || null, p_topic: parsed.data.topic, p_hours: parsed.data.hours });
  if (error || !data) return { ok: false, error: hangoutError(error?.message, "Couldn't start the hangout.") };
  return { ok: true, data: { conversationId: data } };
}

/** +hours for any participant; `keep` (host only) makes it a permanent group conversation. */
export async function extendHangoutAction(input: { conversationId: string; hours?: number; keep?: boolean }): Promise<ActionResult<{ until: string | null }>> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = z.object({ conversationId: z.uuid(), hours: z.number().int().min(1).max(6).default(1), keep: z.boolean().default(false) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid hangout" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("extend_hangout", { p_conversation_id: parsed.data.conversationId, p_hours: parsed.data.hours, p_keep: parsed.data.keep });
  if (error) return { ok: false, error: hangoutError(error.message, "Couldn't update the hangout.") };
  return { ok: true, data: { until: data ?? null } };
}

export async function endHangoutAction(input: { conversationId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const parsed = conversationId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid hangout" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_hangout", { p_conversation_id: parsed.data.conversationId });
  return error ? { ok: false, error: hangoutError(error.message, "Couldn't end the hangout.") } : { ok: true };
}

// ---------------------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------------------

export type DirectMessage = Tables<"direct_messages">;

const sendSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  content: messageContentSchema,
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
  replyToId: z.uuid().nullish(),
  sticker: z.string().refine(isStickerId, "Unknown sticker").nullish(),
  inviteServerId: z.uuid().optional(),
});

export async function sendDirectMessageAction(input: z.input<typeof sendSchema>): Promise<ActionResult<{ message: DirectMessage }>> {
  const { user, limited } = await authed("message");
  if (limited) return RATE_LIMITED;
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const { id, conversationId: conversation, content, replyToId, sticker, attachments, inviteServerId } = parsed.data;
  if (!content && !sticker && !attachments.length) return { ok: false, error: "The message is empty." };
  if (attachments.some((a) => !a.path.startsWith(`dm/${conversation}/${user.id}/`))) return { ok: false, error: "Upload these files to this conversation first." };

  const supabase = await createClient();
  const values = { id, conversation_id: conversation, author_id: user.id, content, reply_to_id: replyToId ?? null, sticker: sticker ?? null, ...(attachments.length ? { attachments } : {}), ...(inviteServerId ? { invite_server_id: inviteServerId } : {}) };
  let { data, error } = await supabase
    .from("direct_messages")
    .insert(values)
    .select("*")
    .single();
  // Existing invitation DMs remain usable while an older database awaits the additive push migration.
  if (inviteServerId && ["42703", "PGRST204"].includes(error?.code ?? "") && error?.message.includes("invite_server_id")) {
    delete values.invite_server_id;
    ({ data, error } = await supabase.from("direct_messages").insert(values).select("*").single());
  }
  if (data) return { ok: true, data: { message: data } };
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("direct_messages").select("*").eq("id", id).eq("conversation_id", conversation).eq("author_id", user.id).maybeSingle();
    if (existing) return { ok: true, data: { message: existing } };
  }
  const code = ["AUTOMOD_BLOCKED", "DM_NOT_ALLOWED", "RATE_LIMITED"].find((c) => error?.message?.includes(c));
  return { ok: false, error: communityError(error?.message, "Couldn't send."), code };
}

export async function editDirectMessageAction(input: { messageId: string; content: string }): Promise<ActionResult> {
  const { limited } = await authed("message");
  if (limited) return RATE_LIMITED;
  const id = z.uuid().safeParse(input.messageId);
  const content = messageContentSchema.safeParse(input.content);
  if (!id.success || !content.success) return { ok: false, error: "Invalid message" };
  const supabase = await createClient();
  if (!content.data) {
    const { data } = await supabase.from("direct_messages").select("attachments, sticker").eq("id", id.data).maybeSingle();
    if (!data?.sticker && !parseAttachments(data?.attachments).length) return { ok: false, error: "A message can't be empty — delete it instead." };
  }
  const { data, error } = await supabase.from("direct_messages").update({ content: content.data }).eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only you can edit your messages.") };
  return { ok: true };
}

export async function deleteDirectMessageAction(input: { messageId: string }): Promise<ActionResult> {
  const { limited } = await authed();
  if (limited) return RATE_LIMITED;
  const id = z.uuid().safeParse(input.messageId);
  if (!id.success) return { ok: false, error: "Invalid message" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("direct_messages").delete().eq("id", id.data).select("*");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only you can delete your messages.") };
  const paths = parseAttachments(data[0].attachments).map((a) => a.path);
  if (paths.length) await supabase.storage.from("attachments").remove(paths);
  return { ok: true };
}
