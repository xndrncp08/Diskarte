"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError } from "@/lib/community";
import { messageContentSchema } from "@/lib/messages";
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
// Direct messages
// ---------------------------------------------------------------------------------------

export type DirectMessage = Tables<"direct_messages">;

const sendSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  content: messageContentSchema,
  replyToId: z.uuid().nullish(),
  sticker: z.string().refine(isStickerId, "Unknown sticker").nullish(),
});

export async function sendDirectMessageAction(input: z.input<typeof sendSchema>): Promise<ActionResult<{ message: DirectMessage }>> {
  const { user, limited } = await authed("message");
  if (limited) return RATE_LIMITED;
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const { id, conversationId: conversation, content, replyToId, sticker } = parsed.data;
  if (!content && !sticker) return { ok: false, error: "The message is empty." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({ id, conversation_id: conversation, author_id: user.id, content, reply_to_id: replyToId ?? null, sticker: sticker ?? null })
    .select("*")
    .single();
  if (data) return { ok: true, data: { message: data } };
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("direct_messages").select("*").eq("id", id).eq("author_id", user.id).maybeSingle();
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
  if (!content.data) return { ok: false, error: "A message can't be empty — delete it instead." };
  const supabase = await createClient();
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
  const { data, error } = await supabase.from("direct_messages").delete().eq("id", id.data).select("id");
  if (error || !data?.length) return { ok: false, error: communityError(error?.message, "Only you can delete your messages.") };
  return { ok: true };
}
