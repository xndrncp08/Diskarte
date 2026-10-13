"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConversations, useFriendNicknames, useFriends } from "@/hooks/useSocial";
import { isUnread, withNickname } from "@/lib/social";

export type SocialValue = ReturnType<typeof useFriends> &
  Omit<ReturnType<typeof useConversations>, "reload"> &
  ReturnType<typeof useFriendNicknames> & {
    reloadConversations: () => Promise<void>;
    /** Incoming friend requests + unread conversations (for the Home badge). */
    attention: number;
  };

export const SocialContext = createContext<SocialValue | null>(null);

/**
 * One app-wide subscription to friendships and DM conversations, shared by the home sidebar,
 * the friends page, DM views and the server rail badge.
 */
export function SocialProvider({ children }: { children: ReactNode }) {
  const friends = useFriends();
  const { conversations, reload: reloadConversations, markRead } = useConversations();
  const { nicknames, setNickname } = useFriendNicknames();
  const attention = (friends.friends?.filter((f) => f.status === "incoming").length ?? 0) + (conversations?.filter(isUnread).length ?? 0);
  // My private nicknames replace display names here, so every friends/DM surface shows them.
  const value = useMemo<SocialValue>(
    () => ({
      ...friends,
      profiles: new Map([...friends.profiles].map(([id, p]) => [id, withNickname(p, nicknames)])),
      conversations: conversations?.map((c) => ({ ...c, others: c.others.map((p) => withNickname(p, nicknames)) })) ?? null,
      reloadConversations,
      markRead,
      attention,
      nicknames,
      setNickname,
    }),
    [friends, conversations, reloadConversations, markRead, attention, nicknames, setNickname],
  );
  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialValue {
  const value = useContext(SocialContext);
  if (!value) throw new Error("useSocial must be used inside <SocialProvider>");
  return value;
}

export function useOptionalSocial(): SocialValue | null {
  return useContext(SocialContext);
}
