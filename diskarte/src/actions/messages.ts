"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError } from "@/lib/community";
import { isValidReaction } from "@/lib/emoji";
import { attachmentPrefix, MAX_ATTACHMENTS, MESSAGE_SELECT, parseAttachments, type MessageWithAuthor } from "@/lib/messages";
import { attachmentSchema, messageContentSchema } from "@/lib/schemas/messages";
import { limiters } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/schemas/servers";
import { isStickerId } from "@/lib/stickers";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

function messageError(message: string | undefined) {
  if (message?.includes("RATE_LIMITED")) return "Slow down — you're sending too fast.";
  if (message?.includes("NOT_A_TEXT_CHANNEL")) return "You can't send messages in a voice channel.";
  if (message?.includes("INVALID_ATTACHMENT")) return "Something's wrong with an attachment. Upload it again.";
  if (message?.includes("ONLY_AUTHOR_CAN_EDIT")) return "Only you can edit your messages.";
  if (message?.includes("ONLY_MODERATORS_CAN_PIN")) return "Only moderators can pin messages.";
  if (message?.includes("RULES_NOT_ACCEPTED")) return "Accept this server's rules first.";
  if (message?.includes("TOO_MANY_REACTIONS")) return "This message has too many reactions.";
  if (message?.includes("row-level security")) return "You don't have permission for this.";
  return communityError(message);
}

async function requireUser(bucket: "message" | "mutation" = "mutation") {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ok = limiters[bucket].check(`${bucket}:${user.id}`).ok;
  return { user, ok };
}

const sendSchema = z.object({
  id: z.uuid(),
  channelId: z.uuid(),
  content: messageContentSchema,
  replyToId: z.uuid().nullish(),
  threadId: z.uuid().nullish(),
  sticker: z.string().refine(isStickerId, "Unknown sticker").nullish(),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
  /** Forum posts only (the database ignores it elsewhere). */
  title: z.string().trim().max(100, "Titles are 100 characters max").nullish(),
});

export async function sendMessageAction(input: z.input<typeof sendSchema>): Promise<ActionResult<{ message: MessageWithAuthor }>> {
  const { user, ok } = await requireUser("message");
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED"), code: "RATE_LIMITED" };
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const { id, channelId, content, replyToId, threadId, sticker, attachments, title } = parsed.data;
  if (!content && attachments.length === 0 && !sticker) return { ok: false, error: "The message is empty." };

  const supabase = await createClient();
  if (attachments.length > 0) {
    const { data: channel } = await supabase.from("channels").select("server_id").eq("id", channelId).maybeSingle();
    if (!channel) return { ok: false, error: "Channel not found" };
    const prefix = attachmentPrefix(channel.server_id, channelId, user.id);
    if (attachments.some((a) => !a.path.startsWith(prefix))) return { ok: false, error: messageError("INVALID_ATTACHMENT") };
  }

  // No .single(): PostgREST rolls back the whole transaction when a singular response doesn't get
  // exactly one row, which would also undo auto-mod's audit entry for a dropped message.
  const { data: rows, error } = await supabase
    .from("messages")
    .insert({ id, channel_id: channelId, author_id: user.id, content, reply_to_id: replyToId ?? null, thread_id: threadId ?? null, sticker: sticker ?? null, attachments, ...(title ? { title } : {}) })
    .select(MESSAGE_SELECT);
  const data = rows?.[0];
  if (data) return { ok: true, data: { message: data as unknown as MessageWithAuthor } };
  // Auto-mod drops the row (so its audit entry survives): the insert succeeds with no row.
  if (!error) return { ok: false, error: communityError("AUTOMOD_BLOCKED"), code: "AUTOMOD_BLOCKED" };

  // A retried send (offline queue, flaky network) whose first attempt already landed.
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("messages").select(MESSAGE_SELECT).eq("id", id).eq("channel_id", channelId).eq("author_id", user.id).maybeSingle();
    if (existing) return { ok: true, data: { message: existing as unknown as MessageWithAuthor } };
  }
  if (error.code === "PGRST116") return { ok: false, error: communityError("AUTOMOD_BLOCKED"), code: "AUTOMOD_BLOCKED" };
  if (error?.message?.includes("SLOWMODE")) {
    const retryAfter = Math.max(1, Number.parseInt(error.details ?? "", 10) || 5);
    return { ok: false, error: `Slow mode — you can send again in ${retryAfter}s.`, code: "SLOWMODE", retryAfter };
  }
  if (error?.message?.includes("VERIFICATION_REQUIRED")) return { ok: false, error: messageError(error.message), code: "VERIFICATION_REQUIRED" };
  if (error?.message?.includes("READ_ONLY_CHANNEL")) return { ok: false, error: messageError(error.message), code: "READ_ONLY_CHANNEL" };
  if (error?.message?.includes("POST_TITLE_REQUIRED")) return { ok: false, error: "Give your post a title.", code: "POST_TITLE_REQUIRED" };
  if (error?.message?.includes("TIMED_OUT")) return { ok: false, error: messageError(error.message), code: "TIMED_OUT" };
  return { ok: false, error: messageError(error?.message) };
}

export async function editMessageAction(input: { messageId: string; content: string }): Promise<ActionResult> {
  const { ok } = await requireUser("message");
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED") };
  if (!uuidSchema.safeParse(input.messageId).success) return { ok: false, error: "Invalid message" };
  const content = messageContentSchema.safeParse(input.content);
  if (!content.success) return { ok: false, error: content.error.issues[0]?.message };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("messages").select("attachments, sticker").eq("id", input.messageId).maybeSingle();
  if (!existing) return { ok: false, error: "Couldn't find that message." };
  if (!content.data && parseAttachments(existing.attachments).length === 0 && !existing.sticker) return { ok: false, error: "A message can't be empty — delete it instead." };

  const { data, error } = await supabase.from("messages").update({ content: content.data }).eq("id", input.messageId).select("id");
  if (error || !data?.length) return { ok: false, error: messageError(error?.message ?? "ONLY_AUTHOR_CAN_EDIT") };
  return { ok: true };
}

export async function deleteMessageAction(input: { messageId: string }): Promise<ActionResult> {
  const { ok } = await requireUser();
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED") };
  if (!uuidSchema.safeParse(input.messageId).success) return { ok: false, error: "Invalid message" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").delete().eq("id", input.messageId).select("attachments");
  if (error || !data?.length) return { ok: false, error: messageError(error?.message ?? "row-level security") };
  // Clean up the files too (storage policies allow the uploader or a moderator).
  const paths = parseAttachments(data[0].attachments).map((a) => a.path);
  if (paths.length) await supabase.storage.from("attachments").remove(paths);
  return { ok: true };
}

export async function setPinnedAction(input: { messageId: string; pinned: boolean }): Promise<ActionResult> {
  const { ok } = await requireUser();
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED") };
  if (!uuidSchema.safeParse(input.messageId).success) return { ok: false, error: "Invalid message" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").update({ pinned: input.pinned }).eq("id", input.messageId).select("id");
  if (error || !data?.length) return { ok: false, error: messageError(error?.message ?? "ONLY_MODERATORS_CAN_PIN") };
  return { ok: true };
}

export async function toggleReactionAction(input: { messageId: string; emoji: string; on: boolean }): Promise<ActionResult> {
  const { user, ok } = await requireUser("message");
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED") };
  if (!uuidSchema.safeParse(input.messageId).success || !(isValidReaction(input.emoji) || /^:[a-z0-9_]{2,32}:$/.test(input.emoji))) return { ok: false, error: "Invalid reaction" };
  const supabase = await createClient();
  // Not a built-in: it has to be one of this server's custom emoji (removing an old one is always fine).
  if (input.on && !isValidReaction(input.emoji)) {
    const { data: message } = await supabase.from("messages").select("server_id").eq("id", input.messageId).maybeSingle();
    const { data: emoji } = message ? await supabase.from("server_emojis").select("id").eq("server_id", message.server_id).eq("name", input.emoji.slice(1, -1)).maybeSingle() : { data: null };
    if (!emoji) return { ok: false, error: "Invalid reaction" };
  }
  if (input.on) {
    const { error } = await supabase.from("reactions").upsert({ message_id: input.messageId, user_id: user.id, emoji: input.emoji }, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true });
    if (error) return { ok: false, error: messageError(error.message) };
  } else {
    const { error } = await supabase.from("reactions").delete().eq("message_id", input.messageId).eq("user_id", user.id).eq("emoji", input.emoji);
    if (error) return { ok: false, error: messageError(error.message) };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------
// Forum tags, solved posts and suggestion boards (migration 20261108020000)
// ---------------------------------------------------------------------------------------

function forumError(message: string | undefined, fallback: string) {
  if (message?.includes("INVALID_FORUM_SETTINGS")) return "Up to 12 tags, 20 characters each.";
  if (message?.includes("INVALID_TAGS")) return "Pick up to 5 of this forum's tags.";
  if (message?.includes("INVALID_STATUS")) return "That status doesn't fit this forum.";
  if (message?.includes("POST_NOT_FOUND")) return "That post is gone.";
  if (message?.includes("NOT_ALLOWED")) return "You don't have permission for this.";
  if (message?.includes("RATE_LIMITED")) return "Slow down a little with the votes.";
  return communityError(message, fallback);
}

const FORUM_STATUSES = ["solved", "under_consideration", "planned", "in_progress", "completed", "declined"] as const;

export async function setForumSettingsAction(input: { channelId: string; mode: "discussion" | "suggestions"; tags: string[] }): Promise<ActionResult> {
  const { ok } = await requireUser();
  if (!ok) return { ok: false, error: "Slow down a little.", code: "RATE_LIMITED" };
  const parsed = z
    .object({ channelId: z.uuid(), mode: z.enum(["discussion", "suggestions"]), tags: z.array(z.string().trim().max(20, "Tags are 20 characters max")).max(12, "Up to 12 tags.") })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_forum_settings", { p_channel: parsed.data.channelId, p_mode: parsed.data.mode, p_tags: parsed.data.tags });
  return error ? { ok: false, error: forumError(error.message, "Couldn't save the forum settings.") } : { ok: true };
}

/** Tags (null = unchanged) and, when `status` is present (null clears it), the post's status. */
export async function setForumPostAction(input: { messageId: string; tags?: string[] | null; status?: (typeof FORUM_STATUSES)[number] | null }): Promise<ActionResult> {
  const { ok } = await requireUser();
  if (!ok) return { ok: false, error: "Slow down a little.", code: "RATE_LIMITED" };
  const parsed = z
    .object({ messageId: z.uuid(), tags: z.array(z.string().max(20)).max(5).nullish(), status: z.enum(FORUM_STATUSES).nullish() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid post settings" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_forum_post", {
    p_message: parsed.data.messageId,
    p_tags: parsed.data.tags ?? null,
    p_status: parsed.data.status ?? null,
    p_set_status: "status" in input,
  });
  return error ? { ok: false, error: forumError(error.message, "Couldn't update the post.") } : { ok: true };
}

export async function toggleForumVoteAction(input: { messageId: string }): Promise<ActionResult<{ voted: boolean }>> {
  const { ok } = await requireUser();
  if (!ok) return { ok: false, error: "Slow down a little.", code: "RATE_LIMITED" };
  if (!uuidSchema.safeParse(input.messageId).success) return { ok: false, error: "Invalid post" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("toggle_forum_vote", { p_message: input.messageId });
  return error ? { ok: false, error: forumError(error.message, "Couldn't vote.") } : { ok: true, data: { voted: data === true } };
}
