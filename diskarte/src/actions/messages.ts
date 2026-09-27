"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { communityError } from "@/lib/community";
import { isValidReaction } from "@/lib/emoji";
import { attachmentPrefix, attachmentSchema, MAX_ATTACHMENTS, MESSAGE_SELECT, messageContentSchema, parseAttachments, type MessageWithAuthor } from "@/lib/messages";
import { limiters } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/servers";
import { isStickerId } from "@/lib/stickers";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

function messageError(message: string | undefined) {
  if (message?.includes("RATE_LIMITED")) return "Dahan-dahan lang, kabayan — masyadong mabilis mag-send.";
  if (message?.includes("NOT_A_TEXT_CHANNEL")) return "Hindi pwedeng mag-message sa voice channel.";
  if (message?.includes("INVALID_ATTACHMENT")) return "May problema sa attachment. I-upload ulit.";
  if (message?.includes("ONLY_AUTHOR_CAN_EDIT")) return "Ikaw lang ang pwedeng mag-edit ng message mo.";
  if (message?.includes("ONLY_MODERATORS_CAN_PIN")) return "Moderators lang ang pwedeng mag-pin.";
  if (message?.includes("TOO_MANY_REACTIONS")) return "Sobrang dami nang reactions dito.";
  if (message?.includes("row-level security")) return "Wala kang permiso para dito.";
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
});

export async function sendMessageAction(input: z.input<typeof sendSchema>): Promise<ActionResult<{ message: MessageWithAuthor }>> {
  const { user, ok } = await requireUser("message");
  if (!ok) return { ok: false, error: messageError("RATE_LIMITED"), code: "RATE_LIMITED" };
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message" };
  const { id, channelId, content, replyToId, threadId, sticker, attachments } = parsed.data;
  if (!content && attachments.length === 0 && !sticker) return { ok: false, error: "Walang laman ang message." };

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
    .insert({ id, channel_id: channelId, author_id: user.id, content, reply_to_id: replyToId ?? null, thread_id: threadId ?? null, sticker: sticker ?? null, attachments })
    .select(MESSAGE_SELECT);
  const data = rows?.[0];
  if (data) return { ok: true, data: { message: data as unknown as MessageWithAuthor } };
  // Auto-mod drops the row (so its audit entry survives): the insert succeeds with no row.
  if (!error) return { ok: false, error: communityError("AUTOMOD_BLOCKED"), code: "AUTOMOD_BLOCKED" };

  // A retried send (offline queue, flaky network) whose first attempt already landed.
  if (error?.code === "23505") {
    const { data: existing } = await supabase.from("messages").select(MESSAGE_SELECT).eq("id", id).eq("author_id", user.id).maybeSingle();
    if (existing) return { ok: true, data: { message: existing as unknown as MessageWithAuthor } };
  }
  if (error.code === "PGRST116") return { ok: false, error: communityError("AUTOMOD_BLOCKED"), code: "AUTOMOD_BLOCKED" };
  if (error?.message?.includes("SLOWMODE")) {
    const retryAfter = Math.max(1, Number.parseInt(error.details ?? "", 10) || 5);
    return { ok: false, error: `Slow mode — makakapag-send ulit in ${retryAfter}s.`, code: "SLOWMODE", retryAfter };
  }
  if (error?.message?.includes("VERIFICATION_REQUIRED")) return { ok: false, error: messageError(error.message), code: "VERIFICATION_REQUIRED" };
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
  if (!existing) return { ok: false, error: "Hindi mahanap ang message." };
  if (!content.data && parseAttachments(existing.attachments).length === 0 && !existing.sticker) return { ok: false, error: "Hindi pwedeng walang laman — i-delete na lang." };

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
  if (!uuidSchema.safeParse(input.messageId).success || !isValidReaction(input.emoji)) return { ok: false, error: "Invalid reaction" };
  const supabase = await createClient();
  if (input.on) {
    const { error } = await supabase.from("reactions").upsert({ message_id: input.messageId, user_id: user.id, emoji: input.emoji }, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true });
    if (error) return { ok: false, error: messageError(error.message) };
  } else {
    const { error } = await supabase.from("reactions").delete().eq("message_id", input.messageId).eq("user_id", user.id).eq("emoji", input.emoji);
    if (error) return { ok: false, error: messageError(error.message) };
  }
  return { ok: true };
}
