"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { classifyFriendships, SOCIAL_PROFILE_COLUMNS, sortConversations, type ConversationSummary, type FriendEntry, type SocialProfile } from "@/lib/social";

/** Re-runs `load` at most once per `ms` while realtime events stream in. */
function useDebounced(load: () => Promise<void>, ms = 300) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), ms);
  }, [load, ms]);
}

/** Friends, pending requests and blocks, live. */
export function useFriends() {
  const supabase = useSupabase();
  const { me } = useMe();
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Map<string, SocialProfile>>(() => new Map());

  const load = useCallback(async () => {
    const [{ data: rows }, { data: blocks }] = await Promise.all([supabase.from("friendships").select("*"), supabase.from("user_blocks").select("blocked_id")]);
    const entries = classifyFriendships(rows ?? [], me.id);
    const blockedIds = (blocks ?? []).map((b) => b.blocked_id);
    const ids = Array.from(new Set([...entries.map((e) => e.userId), ...blockedIds]));
    const { data: people } = ids.length ? await supabase.from("profiles").select(SOCIAL_PROFILE_COLUMNS).in("id", ids) : { data: [] };
    setProfiles(new Map(((people ?? []) as SocialProfile[]).map((p) => [p.id, p])));
    setFriends(entries);
    setBlocked(blockedIds);
  }, [supabase, me.id]);

  const reload = useDebounced(load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    // RLS limits these events to friendships I'm part of.
    const channel = supabase
      .channel(`db:friends:${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, me.id, load, reload]);

  return { friends, blocked, profiles, reload: load };
}

/** My DM conversations (1:1 and groups), newest first, with unread state. */
export function useConversations() {
  const supabase = useSupabase();
  const { me } = useMe();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);

  const load = useCallback(async () => {
    const { data: mine } = await supabase.from("dm_participants").select("conversation_id, last_read_at").eq("user_id", me.id);
    const ids = (mine ?? []).map((p) => p.conversation_id);
    if (ids.length === 0) {
      setConversations([]);
      return;
    }
    const [{ data: convs }, { data: participants }] = await Promise.all([
      supabase.from("dm_conversations").select("*").in("id", ids),
      supabase.from("dm_participants").select("conversation_id, user_id").in("conversation_id", ids),
    ]);
    const otherIds = Array.from(new Set((participants ?? []).map((p) => p.user_id).filter((id) => id !== me.id)));
    const { data: people } = otherIds.length ? await supabase.from("profiles").select(SOCIAL_PROFILE_COLUMNS).in("id", otherIds) : { data: [] };
    const byId = new Map(((people ?? []) as SocialProfile[]).map((p) => [p.id, p]));
    const readAt = new Map((mine ?? []).map((p) => [p.conversation_id, p.last_read_at]));
    setConversations(
      sortConversations(
        (convs ?? []).map((c) => ({
          id: c.id,
          kind: c.kind,
          name: c.name,
          ownerId: c.owner_id,
          lastMessageAt: c.last_message_at,
          lastReadAt: readAt.get(c.id) ?? c.created_at,
          others: (participants ?? [])
            .filter((p) => p.conversation_id === c.id && p.user_id !== me.id)
            .map((p) => byId.get(p.user_id))
            .filter((p): p is SocialProfile => Boolean(p)),
        })),
      ),
    );
  }, [supabase, me.id]);

  const reload = useDebounced(load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; realtime keeps it current
    void load();
    const channel = supabase
      .channel(`db:dms:${me.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_conversations" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_participants" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, me.id, load, reload]);

  /** Optimistically clear the unread dot (the RPC updates last_read_at). */
  const markRead = useCallback(
    (conversationId: string) => {
      setConversations((prev) => prev?.map((c) => (c.id === conversationId ? { ...c, lastReadAt: new Date().toISOString() } : c)) ?? prev);
      void supabase.rpc("mark_dm_read", { p_conversation_id: conversationId });
    },
    [supabase],
  );

  return { conversations, reload: load, markRead };
}
