import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

export type Message = Tables<"messages">;
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
