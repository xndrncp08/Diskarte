"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { MESSAGE_SELECT, messageContentSchema, type MessageWithAuthor } from "@/lib/messages";
import { limiters } from "@/lib/rate-limit";
import { uuidSchema } from "@/lib/servers";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./servers";

function messageError(message: string | undefined) {
  if (message?.includes("RATE_LIMITED")) return "Dahan-dahan lang, kabayan — masyadong mabilis mag-send.";
  if (message?.includes("NOT_A_TEXT_CHANNEL")) return "Hindi pwedeng mag-message sa voice channel.";
  if (message?.includes("row-level security")) return "Wala kang permiso mag-message dito.";
  return "Hindi na-send ang message. Subukan ulit.";
}

export async function sendMessageAction(input: { channelId: string; content: string; replyToId?: string | null }): Promise<ActionResult<{ message: MessageWithAuthor }>> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!limiters.message.check(`msg:${user.id}`).ok) return { ok: false, error: messageError("RATE_LIMITED") };
  if (!uuidSchema.safeParse(input.channelId).success) return { ok: false, error: "Invalid channel" };

  const content = messageContentSchema.safeParse(input.content);
  if (!content.success) return { ok: false, error: content.error.issues[0]?.message };
  if (!content.data) return { ok: false, error: "Walang laman ang message." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_id: input.channelId,
      author_id: user.id,
      content: content.data,
      reply_to_id: input.replyToId && uuidSchema.safeParse(input.replyToId).success ? input.replyToId : null,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error || !data) return { ok: false, error: messageError(error?.message) };
  return { ok: true, data: { message: data as unknown as MessageWithAuthor } };
}
