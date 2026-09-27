"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConversations, useFriends } from "@/hooks/useSocial";
import { isUnread } from "@/lib/social";

type SocialValue = ReturnType<typeof useFriends> &
  Omit<ReturnType<typeof useConversations>, "reload"> & {
    reloadConversations: () => Promise<void>;
    /** Incoming friend requests + unread conversations (for the Home badge). */
    attention: number;
  };

const SocialContext = createContext<SocialValue | null>(null);

/**
 * One app-wide subscription to friendships and DM conversations, shared by the home sidebar,
 * the friends page, DM views and the server rail badge.
 */
export function SocialProvider({ children }: { children: ReactNode }) {
  const friends = useFriends();
  const { conversations, reload: reloadConversations, markRead } = useConversations();
  const attention = (friends.friends?.filter((f) => f.status === "incoming").length ?? 0) + (conversations?.filter(isUnread).length ?? 0);
  const value = useMemo<SocialValue>(
    () => ({ ...friends, conversations, reloadConversations, markRead, attention }),
    [friends, conversations, reloadConversations, markRead, attention],
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
