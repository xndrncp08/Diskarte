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

export const AUTHOR_COLUMNS = "id, username, display_name, avatar_url, avatar_preset";
export const MESSAGE_SELECT = `*, author:profiles!messages_author_id_fkey(${AUTHOR_COLUMNS})`;

export const MAX_ATTACHMENTS = 10;

export const ATTACHMENT_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/mpeg", "video/mp4", "audio/webm", "audio/ogg", "audio/mp4"] as const;
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** `<server uuid>/<channel uuid>/<user uuid>/<random uuid>.<ext>` — nothing user-controlled. */
export const ATTACHMENT_PATH_RE = /^(?:[0-9a-f-]{36}|dm)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp3|mp4|webm|ogg|m4a)$/;

export interface Attachment {
  path: string;
  name: string;
  size: number;
  type: (typeof ATTACHMENT_MIME)[number];
  width?: number;
  height?: number;
  /** A recorded voice message (shown as a compact player) and its length in seconds. */
  voice?: boolean;
  duration?: number;
}

/** Every attachment must live in the uploader's folder for this exact channel (DB trigger enforces too). */
export function attachmentPrefix(serverId: string, channelId: string, userId: string) {
  return `${serverId}/${channelId}/${userId}/`;
}

const isInt = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** The valid attachments of a message row (mirrors attachmentSchema without shipping zod to the browser). */
export function parseAttachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Attachment[] => {
    if (!item || typeof item !== "object") return [];
    const a = item as Record<string, unknown>;
    const ok =
      typeof a.path === "string" && a.path.length <= 200 && ATTACHMENT_PATH_RE.test(a.path) &&
      typeof a.name === "string" && a.name.length >= 1 && a.name.length <= 120 &&
      isInt(a.size, 1, ATTACHMENT_MAX_BYTES) &&
      (ATTACHMENT_MIME as readonly unknown[]).includes(a.type) &&
      (a.width === undefined || isInt(a.width, 1, 20000)) &&
      (a.height === undefined || isInt(a.height, 1, 20000)) &&
      (a.voice === undefined || typeof a.voice === "boolean") &&
      (a.duration === undefined || (typeof a.duration === "number" && a.duration >= 0 && a.duration <= 3600));
    if (!ok) return [];
    const out: Attachment = { path: a.path as string, name: a.name as string, size: a.size as number, type: a.type as Attachment["type"] };
    if (a.width !== undefined) out.width = a.width as number;
    if (a.height !== undefined) out.height = a.height as number;
    if (a.voice !== undefined) out.voice = a.voice as boolean;
    if (a.duration !== undefined) out.duration = a.duration as number;
    return [out];
  });
}

export function isImageAttachment(a: Attachment) {
  return a.type.startsWith("image/");
}

export function isVideoAttachment(a: Attachment) {
  return a.type === "video/mp4";
}

export function isAudioAttachment(a: Attachment) {
  return a.type.startsWith("audio/");
}

/** 75 → "1:15". */
export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
