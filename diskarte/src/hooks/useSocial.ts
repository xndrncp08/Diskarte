"use client";

import { closeNotifications, flushReads, notificationTag, pendingReads, queueRead } from "@/lib/read-receipts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { subscribeDbChanges } from "@/lib/realtime";
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
    return subscribeDbChanges(supabase, `friends:${me.id}`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, reload),
    );
  }, [supabase, me.id, load, reload]);

  return { friends, blocked, profiles, reload: load };
}

/** The later of two ISO timestamps (a missing one loses). */
export function latest(a: string, b: string | undefined): string {
  return b && Date.parse(b) > Date.parse(a) ? b : a;
}

/** My DM conversations (1:1 and groups), newest first, with unread state. */
export function useConversations() {
  const supabase = useSupabase();
  const { me } = useMe();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  // What this tab has read, so a reload that races the read receipt (or a device clock behind the
  // server's) can never turn a conversation you've seen back to unread.
  const readMarks = useRef<Map<string, string>>(
    new Map(
      Object.entries(typeof window === "undefined" ? {} : pendingReads())
        .filter(([key]) => key.startsWith("dm:"))
        .map(([key, at]) => [key.slice("dm:".length), at]),
    ),
  );

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
          lastReadAt: latest(readAt.get(c.id) ?? c.created_at, readMarks.current.get(c.id)),
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
    return subscribeDbChanges(supabase, `dms:${me.id}`, (channel) =>
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "dm_conversations" }, reload)
        .on("postgres_changes", { event: "*", schema: "public", table: "dm_participants" }, reload),
    );
  }, [supabase, me.id, load, reload]);

  /** Clear the unread dot now (read up to at least the newest message you saw); the RPC saves it. */
  const markRead = useCallback(
    (conversationId: string) => {
      setConversations(
        (prev) =>
          prev?.map((c) => {
            if (c.id !== conversationId) return c;
            const mark = latest(new Date().toISOString(), c.lastMessageAt);
            readMarks.current.set(c.id, latest(mark, readMarks.current.get(c.id)));
            return { ...c, lastReadAt: latest(c.lastReadAt, mark) };
          }) ?? prev,
      );
      queueRead("dm", conversationId, new Date().toISOString());
      closeNotifications(notificationTag("dm", conversationId));
      void flushReads(supabase);
    },
    [supabase],
  );

  return { conversations, reload: load, markRead };
}

/** My private nicknames for other people (friends list and DMs only), and a setter; empty clears one. */
export function useFriendNicknames() {
  const supabase = useSupabase();
  const { me } = useMe();
  const [nicknames, setNicknames] = useState<ReadonlyMap<string, string>>(() => new Map());

  useEffect(() => {
    let live = true;
    // A missing table (migration not applied yet) just means no nicknames.
    void supabase
      .from("friend_nicknames")
      .select("target_id, nickname")
      .then(({ data }) => {
        if (live && data) setNicknames(new Map(data.map((r) => [r.target_id, r.nickname])));
      });
    return () => {
      live = false;
    };
  }, [supabase, me.id]);

  const setNickname = useCallback(
    async (targetId: string, raw: string) => {
      const nickname = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 32);
      const { error } = nickname
        ? await supabase.from("friend_nicknames").upsert({ owner_id: me.id, target_id: targetId, nickname })
        : await supabase.from("friend_nicknames").delete().eq("owner_id", me.id).eq("target_id", targetId);
      if (error) return false;
      setNicknames((prev) => {
        const next = new Map(prev);
        if (nickname) next.set(targetId, nickname);
        else next.delete(targetId);
        return next;
      });
      return true;
    },
    [supabase, me.id],
  );

  return { nicknames, setNickname };
}
