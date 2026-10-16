"use client";

import { createOnce } from "@/lib/once";
import { closeNotifications, flushReads, notificationTag, pendingReads, queueRead } from "@/lib/read-receipts";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { desktopNotify, readNotifyPrefs, serverNotify } from "@/lib/notify-prefs";
import { subscribeDbChanges } from "@/lib/realtime";
import { playSfx } from "@/lib/sfx";
import { readChannelMutes, serverMutes } from "@/lib/channel-mute";

/** How often the rail's unread state refreshes in the background (the open server is live). */
export const UNREADS_POLL_MS = 30_000;
const MARK_DEBOUNCE_MS = 800;

interface ChannelUnread {
  serverId: string;
  lastMessageAt: string | null;
  readAt: string;
  mentions: number;
}

interface UnreadsValue {
  /** Per text channel I can see. */
  channels: ReadonlyMap<string, ChannelUnread>;
  /** I've read this channel (now, and at least up to its newest message). */
  markRead: (channelId: string) => void;
  /** Discord's "Mark Unread": unread again from this message on. */
  markUnread: (channelId: string, fromIso: string) => void;
  /** A channel got a message (live, from the open server's realtime). */
  noteActivity: (channelId: string, serverId: string, at: string) => void;
  refresh: () => void;
  /** Discord's "Mark As Read": one server's channels, or (no id) every channel and DM. */
  markAllRead: (serverId?: string) => void;
}

const UnreadsContext = createContext<UnreadsValue | null>(null);

const later = (a: string | null | undefined, b: string | null | undefined) => (!a ? (b ?? null) : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);

export function isUnread(c: ChannelUnread | undefined) {
  return !!c?.lastMessageAt && Date.parse(c.lastMessageAt) > Date.parse(c.readAt);
}

/**
 * Discord's unread pills and mention badges. Loads my_unreads() for every channel I can see, refreshes
 * it every 30 s and on focus, and right away when someone mentions me (my own message_mentions rows).
 * The open server feeds channel activity in live; reading a channel marks it on the server (debounced).
 */
// One ping and alert per mentioned message, however many times the row event arrives.
const mentionOnce = createOnce();

export function UnreadsProvider({ children }: { children: ReactNode }) {
  const supabase = useOptionalSupabase();
  const { me } = useMe();
  const [channels, setChannels] = useState<ReadonlyMap<string, ChannelUnread>>(() => new Map());
  // Read marks made in this tab: a refresh racing the server write never brings an unread back.
  // Seeded with receipts a previous session queued but the server hadn't confirmed yet.
  const marks = useRef<Map<string, string>>(
    new Map(
      Object.entries(typeof window === "undefined" ? {} : pendingReads())
        .filter(([key]) => key.startsWith("channel:"))
        .map(([key, at]) => [key.slice("channel:".length), at]),
    ),
  );
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // "Mark Unread" read points, kept until the server agrees (a refresh in between can't undo it).
  const rewinds = useRef(new Map<string, string>());
  const router = useRouter();

  // Someone @mentioned me: ping, and a desktop notification (Settings → Notifications), unless the
  // server is muted or set to Nothing, or I'm already looking at that channel.
  const onMention = useEffectEvent(async (row: { message_id?: string; channel_id?: string; server_id?: string }) => {
    if (!supabase || !row.message_id || !row.channel_id || !row.server_id || !mentionOnce(row.message_id)) return;
    const level = serverNotify(readNotifyPrefs(), row.server_id);
    if (level.muted || level.level === "nothing") return;
    if (serverMutes(readChannelMutes(), row.server_id).muted.has(row.channel_id)) return;
    const href = `/tambayan/${row.server_id}/${row.channel_id}`;
    if (document.hasFocus() && window.location.pathname === href) return;
    playSfx("mention");
    const [{ data: message }, { data: channel }] = await Promise.all([
      supabase.from("messages").select("content, author_id").eq("id", row.message_id).maybeSingle(),
      supabase.from("channels").select("name").eq("id", row.channel_id).maybeSingle(),
    ]);
    if (!message) return;
    const { data: author } = message.author_id ? await supabase.from("profiles").select("display_name").eq("id", message.author_id).maybeSingle() : { data: null };
    desktopNotify({ title: `${author?.display_name ?? "Someone"} in #${channel?.name ?? "a channel"}`, body: message.content, tag: notificationTag("channel", row.channel_id), href, open: (to) => router.push(to) });
  });

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("my_unreads");
    // Not migrated yet (or offline): keep what we have; no badges is the safe default.
    if (error || !data) return;
    setChannels(
      new Map(
        data.map((r) => {
          const rewind = rewinds.current.get(r.channel_id);
          if (rewind && Date.parse(r.read_at) <= Date.parse(rewind) + 1000) rewinds.current.delete(r.channel_id);
          const readAt = rewinds.current.get(r.channel_id) ?? later(r.read_at, marks.current.get(r.channel_id)) ?? r.read_at;
          // The server counts mentions after ITS cursor; if this device has read past the newest
          // message (receipt still on its way), those mentions are already seen.
          const seen = !rewinds.current.has(r.channel_id) && !!r.last_message_at && Date.parse(readAt) >= Date.parse(r.last_message_at);
          return [r.channel_id, { serverId: r.server_id, lastMessageAt: r.last_message_at, readAt, mentions: seen ? 0 : r.mentions }];
        }),
      ),
    );
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    void refresh();
    // Receipts left over from a closed tab or a suspended app go out first.
    void flushReads(supabase);
    const flushNow = () => {
      for (const timer of pending.current.values()) clearTimeout(timer);
      pending.current.clear();
      void flushReads(supabase);
    };
    const onHide = () => document.visibilityState === "hidden" && flushNow();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("online", flushNow);
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), UNREADS_POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("diskarte:push-activity", onFocus);
    const off = subscribeDbChanges(supabase, `mentions:${me.id}`, (channel) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "message_mentions", filter: `user_id=eq.${me.id}` }, ({ new: row }) => {
        void refresh();
        void onMention(row as { message_id?: string; channel_id?: string; server_id?: string });
      }),
    );
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("online", flushNow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("diskarte:push-activity", onFocus);
      off();
    };
  }, [supabase, me.id, refresh]);

  const markRead = useCallback(
    (channelId: string) => {
      rewinds.current.delete(channelId);
      const at = new Date().toISOString();
      setChannels((prev) => {
        const c = prev.get(channelId);
        const upTo = later(at, c?.lastMessageAt) as string;
        marks.current.set(channelId, later(upTo, marks.current.get(channelId)) as string);
        if (!c || (!isUnread(c) && c.mentions === 0)) return prev;
        return new Map(prev).set(channelId, { ...c, readAt: upTo, mentions: 0 });
      });
      // The receipt says "read up to now" (the server caps it at its own clock).
      queueRead("channel", channelId, at);
      closeNotifications(notificationTag("channel", channelId));
      if (!supabase) return;
      clearTimeout(pending.current.get(channelId));
      pending.current.set(
        channelId,
        setTimeout(() => {
          pending.current.delete(channelId);
          void flushReads(supabase);
        }, MARK_DEBOUNCE_MS),
      );
    },
    [supabase],
  );

  const markUnread = useCallback(
    (channelId: string, fromIso: string) => {
      const readAt = new Date(Date.parse(fromIso) - 1).toISOString();
      marks.current.delete(channelId);
      clearTimeout(pending.current.get(channelId));
      pending.current.delete(channelId);
      rewinds.current.set(channelId, readAt);
      setChannels((prev) => {
        const c = prev.get(channelId);
        return c ? new Map(prev).set(channelId, { ...c, readAt }) : prev;
      });
      void supabase?.rpc("mark_channel_unread", { p_channel: channelId, p_from: fromIso });
    },
    [supabase],
  );

  const markAllRead = useCallback(
    (serverId?: string) => {
      const now = new Date().toISOString();
      setChannels((prev) => {
        const next = new Map(prev);
        for (const [id, c] of prev) {
          if (serverId && c.serverId !== serverId) continue;
          const at = later(now, c.lastMessageAt) as string;
          marks.current.set(id, at);
          rewinds.current.delete(id);
          next.set(id, { ...c, readAt: at, mentions: 0 });
        }
        return next;
      });
      void supabase?.rpc("mark_all_read", serverId ? { p_server: serverId } : {});
    },
    [supabase],
  );

  const noteActivity = useCallback((channelId: string, serverId: string, at: string) => {
    setChannels((prev) => {
      const c = prev.get(channelId);
      if (c && c.lastMessageAt && Date.parse(c.lastMessageAt) >= Date.parse(at)) return prev;
      return new Map(prev).set(channelId, { serverId, readAt: c?.readAt ?? at, mentions: c?.mentions ?? 0, lastMessageAt: at });
    });
  }, []);

  const value = useMemo(() => ({ channels, markRead, markUnread, noteActivity, markAllRead, refresh: () => void refresh() }), [channels, markRead, markUnread, noteActivity, markAllRead, refresh]);
  return <UnreadsContext.Provider value={value}>{children}</UnreadsContext.Provider>;
}

export function useOptionalUnreads() {
  return useContext(UnreadsContext);
}

/** One channel's state; `liveLastMessageAt` (the open server's own copy) wins when newer. */
export function useChannelUnread(channelId: string, liveLastMessageAt?: string | null): { unread: boolean; mentions: number } {
  const c = useOptionalUnreads()?.channels.get(channelId);
  if (!c) return { unread: false, mentions: 0 };
  return { unread: isUnread({ ...c, lastMessageAt: later(c.lastMessageAt, liveLastMessageAt) }), mentions: c.mentions };
}

/** A server's rail badge: any unread channel (muted ones excluded) and total mentions. */
export function serverUnread(channels: ReadonlyMap<string, ChannelUnread>, serverId: string, muted: ReadonlySet<string>) {
  let unread = false;
  let mentions = 0;
  for (const [id, c] of channels) {
    if (c.serverId !== serverId) continue;
    mentions += c.mentions;
    if (!muted.has(id) && isUnread(c)) unread = true;
  }
  return { unread, mentions };
}
