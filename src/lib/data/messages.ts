import "server-only";
import { MESSAGE_SELECT, PAGE_SIZE, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";

/** Latest page of messages for a channel (oldest → newest) plus their reactions. RLS limits to members. */
export async function getChannelHistory(channelId: string, limit = PAGE_SIZE): Promise<{ messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  const rows = (data ?? []) as unknown as MessageWithAuthor[];
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).reverse();

  let reactions: Reaction[] = [];
  if (messages.length) {
    const { data: r } = await supabase
      .from("reactions")
      .select("*")
      .in(
        "message_id",
        messages.map((m) => m.id),
      )
      .order("created_at");
    reactions = r ?? [];
  }
  return { messages, reactions, hasMore };
}
