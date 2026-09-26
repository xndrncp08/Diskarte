import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

export interface Attachment {
  path: string;
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
}

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
  .pipe(z.string().max(MESSAGE_MAX, `Hanggang ${MESSAGE_MAX} characters lang ang message.`));

export const AUTHOR_COLUMNS = "id, username, display_name, avatar_url, avatar_preset";
export const MESSAGE_SELECT = `*, author:profiles!messages_author_id_fkey(${AUTHOR_COLUMNS})`;

export const MAX_ATTACHMENTS = 10;

export const attachmentSchema = z.object({
  path: z.string().min(1).max(512).refine((p) => !p.includes("..") && !p.startsWith("/"), "Invalid path"),
  name: z.string().min(1).max(120),
  size: z.number().int().nonnegative().max(25 * 1024 * 1024),
  type: z.string().max(120),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

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
  return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(a.type);
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
