import "server-only";
import { PAGE_SIZE } from "@/lib/messages";
import { uuidSchema } from "@/lib/servers";
import { SOCIAL_PROFILE_COLUMNS, type SocialProfile } from "@/lib/social";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export interface ConversationBundle {
  conversation: Tables<"dm_conversations">;
  participants: SocialProfile[];
  messages: Tables<"direct_messages">[];
  hasMore: boolean;
  /** For 1:1 DMs: whether you can still message them (friends and nobody blocked). */
  canSend: boolean;
}

/** A DM conversation for its participant (RLS hides it from everyone else). */
export async function getConversationBundle(conversationId: string, userId: string): Promise<ConversationBundle | null> {
  if (!uuidSchema.safeParse(conversationId).success) return null;
  const supabase = await createClient();
  const { data: conversation } = await supabase.from("dm_conversations").select("*").eq("id", conversationId).maybeSingle();
  if (!conversation) return null;

  const [{ data: participantRows }, { data: rows }] = await Promise.all([
    supabase.from("dm_participants").select("user_id").eq("conversation_id", conversationId),
    supabase.from("direct_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1),
  ]);
  const ids = (participantRows ?? []).map((p) => p.user_id);
  if (!ids.includes(userId)) return null;
  const { data: people } = await supabase.from("profiles").select(SOCIAL_PROFILE_COLUMNS).in("id", ids);

  let canSend = true;
  if (conversation.kind === "direct") {
    const other = ids.find((id) => id !== userId);
    if (!other) canSend = false;
    else {
      // Blocking deletes the friendship, so an accepted friendship (visible to me via RLS) is enough.
      const [low, high] = [userId, other].sort();
      const { data: friendship } = await supabase.from("friendships").select("status").eq("user_low", low).eq("user_high", high).maybeSingle();
      canSend = friendship?.status === "accepted";
    }
  }

  const messages = rows ?? [];
  return {
    conversation,
    participants: (people ?? []) as SocialProfile[],
    messages: messages.slice(0, PAGE_SIZE).reverse(),
    hasMore: messages.length > PAGE_SIZE,
    canSend,
  };
}
