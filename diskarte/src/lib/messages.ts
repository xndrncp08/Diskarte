import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

export type Message = Tables<"messages">;
export type Reaction = Tables<"reactions">;
export type MessageAuthor = Pick<Tables<"profiles">, "id" | "username" | "display_name" | "avatar_url" | "avatar_preset">;
export type MessageWithAuthor = Message & { author: MessageAuthor | null };

export const MESSAGE_MAX = 4000;
export const PAGE_SIZE = 50;

/** Strip control characters except tab/newline, normalise line endings, trim. */
export function cleanMessageContent(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍⁠﻿]/g, "")
    .trim();
}

export const messageContentSchema = z
  .string()
  .transform(cleanMessageContent)
  .pipe(z.string().max(MESSAGE_MAX, `Messages are ${MESSAGE_MAX} characters max.`));

export const AUTHOR_COLUMNS = "id, username, display_name, avatar_url, avatar_preset";
export const MESSAGE_SELECT = `*, author:profiles!messages_author_id_fkey(${AUTHOR_COLUMNS})`;

export const MAX_ATTACHMENTS = 10;

export const ATTACHMENT_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "video/mp4"] as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** `<server uuid>/<channel uuid>/<user uuid>/<random uuid>.<ext>` — nothing user-controlled. */
export const ATTACHMENT_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp3|mp4)$/;

export const attachmentSchema = z.object({
  path: z.string().max(200).regex(ATTACHMENT_PATH_RE, "Invalid path"),
  name: z.string().min(1).max(120),
  size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  type: z.enum(ATTACHMENT_MIME),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

/** Every attachment must live in the uploader's folder for this exact channel (DB trigger enforces too). */
export function attachmentPrefix(serverId: string, channelId: string, userId: string) {
  return `${serverId}/${channelId}/${userId}/`;
}

export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = attachmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function isImageAttachment(a: Attachment) {
  return a.type.startsWith("image/");
}

export function isVideoAttachment(a: Attachment) {
  return a.type === "video/mp4";
}

export function isAudioAttachment(a: Attachment) {
  return a.type === "audio/mpeg";
}

/** One-line plain-text preview of a Markdown message (reply bars, notifications, pins). */
export function previewText(content: string, max = 120): string {
  const text = content
    .replace(/```[\s\S]*?(```|$)/g, " [code] ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(>|#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|~~|\*|_)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * PostgREST filter for keyset pagination: rows strictly before `cursor` in (created_at, id) order —
 * the order of the (…, created_at desc, id desc) history indexes — so messages that share the oldest
 * loaded timestamp are never skipped at a page boundary. Pair with `.order("created_at", desc)
 * .order("id", desc)`.
 */
export function olderThan(cursor: { created_at: string; id: string }) {
  return `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`;
}

/** Composer notice in a verification-gated channel. */
export const VERIFY_NOTICE = "Only verified accounts can chat here. Confirm your email or phone number first.";
/** Composer notice in a read-only channel (Diskarte HQ's #announcements) for everyone but its admins. */
export const READ_ONLY_NOTICE = "Only creators can post in this channel.";
