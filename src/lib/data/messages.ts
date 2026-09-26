import "server-only";
import { MESSAGE_SELECT, PAGE_SIZE, type MessageWithAuthor } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

/** Latest page of messages for a channel, oldest → newest (RLS limits this to members). */
export async function getRecentMessages(channelId: string, limit = PAGE_SIZE): Promise<MessageWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as MessageWithAuthor[]).reverse();
}
