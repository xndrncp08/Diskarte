import type { MessageAuthor } from "@/lib/messages";
import type { DmKind, Tables } from "@/lib/supabase/database.types";

export type Friendship = Tables<"friendships">;
export type SocialProfile = MessageAuthor & { custom_status?: string | null; custom_status_emoji?: string | null };

export const SOCIAL_PROFILE_COLUMNS = "id, username, display_name, avatar_url, avatar_preset, custom_status, custom_status_emoji";

export interface FriendEntry {
  userId: string;
  status: "accepted" | "incoming" | "outgoing";
  since: string;
}

/** Splits friendship rows (which store the pair as low/high ids) from my point of view. */
export function classifyFriendships(rows: Friendship[], meId: string): FriendEntry[] {
  return rows.map((row) => {
    const userId = row.user_low === meId ? row.user_high : row.user_low;
    const status = row.status === "accepted" ? "accepted" : row.requested_by === meId ? "outgoing" : "incoming";
    return { userId, status, since: row.accepted_at ?? row.created_at };
  });
}

/** How I relate to someone: what an "Add Friend" control should offer. */
export type FriendStatus = "self" | "blocked" | "none" | "outgoing" | "incoming" | "accepted";

/** `null` while my friends list is still loading. */
export function friendStatus(meId: string, userId: string, friends: FriendEntry[] | null, blocked: readonly string[]): FriendStatus | null {
  if (userId === meId) return "self";
  if (blocked.includes(userId)) return "blocked";
  if (!friends) return null;
  return friends.find((f) => f.userId === userId)?.status ?? "none";
}

export interface ConversationSummary {
  id: string;
  kind: DmKind;
  name: string | null;
  ownerId: string | null;
  lastMessageAt: string;
  lastReadAt: string;
  /** Everyone except me. */
  others: SocialProfile[];
}

export function conversationTitle(conversation: Pick<ConversationSummary, "kind" | "name" | "others">): string {
  if (conversation.kind === "group" && conversation.name) return conversation.name;
  const names = conversation.others.map((p) => p.display_name);
  if (names.length === 0) return "Just you";
  if (conversation.kind === "direct") return names[0];
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export function isUnread(conversation: Pick<ConversationSummary, "lastMessageAt" | "lastReadAt">) {
  return new Date(conversation.lastMessageAt).getTime() > new Date(conversation.lastReadAt).getTime() + 500;
}

export function sortConversations<T extends Pick<ConversationSummary, "lastMessageAt">>(list: T[]): T[] {
  return [...list].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}
