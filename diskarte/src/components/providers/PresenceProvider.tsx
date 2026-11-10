"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { flattenPresence, type PresencePayload, type PresenceState } from "@/lib/presence";
import { removeChannelSafely, whenTopicFree } from "@/lib/realtime";

export interface VoicePresence {
  serverId: string;
  channelId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
}

interface Entry {
  channel: RealtimeChannel | null;
  refs: number;
  /** Whether my payload is currently tracked on this topic. */
  tracked: boolean;
  /** The last payload tracked here, minus online_at: an unchanged one isn't re-sent. */
  trackedKey: string | null;
  state: Map<string, PresencePayload>;
  listeners: Set<() => void>;
  subscribed: boolean;
  /** Who is talking in this topic's voice channels (user id → when the claim lapses), from broadcasts. */
  speakingUntil: Map<string, number>;
  speaking: ReadonlySet<string>;
  speakingTimer: ReturnType<typeof setTimeout> | null;
  activity: { revision: number; connected: boolean };
  updateSpeaking: ((userId: string, speaking: boolean) => void) | null;
}

/** A "speaking" claim lapses unless refreshed — covers a missed stop event or a dropped tab. */
export const SPEAKING_TTL_MS = 3500;
const NOBODY: ReadonlySet<string> = new Set();

/** Server-wide presence: status, plus voice state in the server's public voice channels. */
export const serverTopic = (serverId: string) => `server:${serverId}`;
/** Who is in a private voice channel: only people who can view the channel may join this topic. */
export const voiceTopic = (channelId: string) => `voice:${channelId}`;

interface PresenceContextValue {
  acquire: (topic: string) => () => void;
  subscribe: (topic: string, listener: () => void) => () => void;
  snapshot: (topic: string) => Map<string, PresencePayload>;
  speakingSnapshot: (topic: string) => ReadonlySet<string>;
  activitySnapshot: (topic: string) => { revision: number; connected: boolean };
  setVoice: (voice: VoicePresence | null) => void;
  /** Ephemeral voice activity for everyone watching the server (Realtime Broadcast, never stored). */
  broadcastSpeaking: (serverId: string, speaking: boolean) => void;
  /** The server has stored me as visible: rejoin topics joined while invisible so presence is allowed. */
  rejoin: () => void;
}

const NO_ACTIVITY = { revision: 0, connected: false };
const EMPTY = new Map<string, PresencePayload>();
const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * One private Realtime presence channel per topic (`server:<id>`, `voice:<channel id>`, authorised
 * by RLS on realtime.messages), ref-counted so the open server view and an active voice call
 * elsewhere can share it. Each client tracks a single payload per topic carrying status + voice state.
 *
 * Privacy: a private voice channel's occupancy is only published on its own `voice:<id>` topic, never
 * server-wide; and while I'm invisible nothing is tracked at all (the database refuses it too).
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const entries = useRef(new Map<string, Entry>());
  const voice = useRef<VoicePresence | null>(null);
  /** The voice channel I'm in, once it's known to be public (until then it stays off `server:`). */
  const voicePublic = useRef<string | null>(null);
  const voiceHold = useRef<(() => void) | null>(null);
  const base = useRef({ status: me.status, custom_status: me.custom_status, custom_status_emoji: me.custom_status_emoji });
  const authReady = useRef<Promise<void> | null>(null);

  const payloadFor = useCallback(
    (topic: string): PresencePayload => {
      const current = voice.current;
      const here = !!current && (topic === voiceTopic(current.channelId) || (topic === serverTopic(current.serverId) && voicePublic.current === current.channelId));
      const v = here ? current : null;
      return {
        user_id: me.id,
        ...base.current,
        voice_channel_id: v?.channelId ?? null,
        muted: v?.muted ?? false,
        deafened: v?.deafened ?? false,
        video: v?.video ?? false,
        screen: v?.screen ?? false,
        online_at: new Date().toISOString(),
      };
    },
    [me.id],
  );

  /** Track my payload where it belongs; untrack while invisible, or on a voice topic I'm not in. */
  const sync = useCallback(
    (topic: string, entry: Entry) => {
      if (!entry.channel || !entry.subscribed) return;
      const inVoiceTopic = !!voice.current && topic === voiceTopic(voice.current.channelId);
      const show = base.current.status !== "invisible" && (topic.startsWith("server:") || inVoiceTopic);
      if (show) {
        // Re-sending an unchanged payload would tell the topic *when* something else changed (a private call).
        const payload = payloadFor(topic);
        const key = JSON.stringify({ ...payload, online_at: null });
        if (!entry.tracked || entry.trackedKey !== key) void entry.channel.track(payload);
        entry.trackedKey = key;
      } else {
        if (entry.tracked) void entry.channel.untrack();
        entry.trackedKey = null;
      }
      entry.tracked = show;
    },
    [payloadFor],
  );

  const retrack = useCallback(() => {
    for (const [topic, entry] of entries.current) sync(topic, entry);
  }, [sync]);

  const connect = useCallback(
    (topic: string, created: Entry) => {
      authReady.current ??= supabase.realtime.setAuth();
      void authReady.current
        .then(() => whenTopicFree(topic))
        .then(() => {
          if (entries.current.get(topic) !== created || created.refs === 0 || created.channel) return;
          const channel = supabase.channel(topic, { config: { private: true, presence: { key: me.id } } });
          created.channel = channel;
          channel
            .on("presence", { event: "sync" }, () => {
              created.activity = { revision: created.activity.revision + 1, connected: created.subscribed };
              created.state = flattenPresence(channel.presenceState<PresencePayload>() as unknown as PresenceState);
              created.listeners.forEach((l) => l());
            })
            .on("broadcast", { event: "voice_changed" }, () => {
              created.activity = { ...created.activity, revision: created.activity.revision + 1 };
              created.listeners.forEach((listener) => listener());
            })
            .on("broadcast", { event: "speaking" }, ({ payload }) => {
              const event = payload as { user_id?: unknown; speaking?: unknown } | null;
              if (typeof event?.user_id !== "string" || event.user_id === me.id) return;
              created.updateSpeaking?.(event.user_id, event.speaking === true);
            })
            .subscribe((status) => {
              created.subscribed = status === "SUBSCRIBED";
              created.tracked = false;
              created.activity = { revision: created.activity.revision + 1, connected: created.subscribed };
              if (!created.subscribed) {
                created.state = EMPTY; created.speakingUntil.clear(); created.speaking = NOBODY;
                if (created.speakingTimer) clearTimeout(created.speakingTimer);
              }
              created.listeners.forEach((listener) => listener());
              sync(topic, created);
            });
        });
    },
    [supabase, me.id, sync],
  );

  const acquire = useCallback(
    (topic: string) => {
      let entry = entries.current.get(topic);
      if (!entry) {
        const created: Entry = {
          channel: null,
          refs: 0,
          tracked: false,
          trackedKey: null,
          state: EMPTY,
          listeners: new Set(),
          subscribed: false,
          speakingUntil: new Map(),
          speaking: NOBODY,
          speakingTimer: null,
          activity: NO_ACTIVITY,
          updateSpeaking: null,
        };
        // Rebuild the speaking set (dropping lapsed claims) and wake up for the next expiry.
        const settleSpeaking = () => {
          const now = Date.now();
          for (const [id, until] of created.speakingUntil) if (until <= now) created.speakingUntil.delete(id);
          const next = new Set(created.speakingUntil.keys());
          const changed = next.size !== created.speaking.size || [...next].some((id) => !created.speaking.has(id));
          if (changed) {
            created.speaking = next.size ? next : NOBODY;
            created.listeners.forEach((l) => l());
          }
          if (created.speakingTimer) clearTimeout(created.speakingTimer);
          created.speakingTimer = created.speakingUntil.size ? setTimeout(settleSpeaking, Math.max(0, Math.min(...created.speakingUntil.values()) - now) + 20) : null;
        };
        created.updateSpeaking = (id, speaking) => {
          if (speaking) created.speakingUntil.set(id, Date.now() + SPEAKING_TTL_MS);
          else created.speakingUntil.delete(id);
          settleSpeaking();
        };
        entry = created;
        entries.current.set(topic, created);
        created.refs = 1;
        connect(topic, created);
      } else {
        entry.refs += 1;
      }
      const held = entry;
      return () => {
        held.refs -= 1;
        if (held.refs > 0) return;
        entries.current.delete(topic);
        if (held.speakingTimer) clearTimeout(held.speakingTimer);
        if (held.channel) void removeChannelSafely(supabase, topic, held.channel);
      };
    },
    [supabase, connect],
  );

  const subscribe = useCallback((topic: string, listener: () => void) => {
    const entry = entries.current.get(topic);
    if (!entry) return () => undefined;
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, []);

  const snapshot = useCallback((topic: string) => entries.current.get(topic)?.state ?? EMPTY, []);
  const activitySnapshot = useCallback((topic: string) => entries.current.get(topic)?.activity ?? NO_ACTIVITY, []);
  const speakingSnapshot = useCallback((topic: string) => entries.current.get(topic)?.speaking ?? NOBODY, []);

  const broadcastSpeaking = useCallback(
    (serverId: string, speaking: boolean) => {
      if (base.current.status === "invisible") return;
      const v = voice.current;
      // Talking in a private (or not yet confirmed public) channel is only told to people who can see it.
      const topic = v && v.serverId === serverId && voicePublic.current !== v.channelId ? voiceTopic(v.channelId) : serverTopic(serverId);
      const entry = entries.current.get(topic);
      if (!entry?.channel || !entry.subscribed) return;
      entry.updateSpeaking?.(me.id, speaking);
      void entry.channel.send({ type: "broadcast", event: "speaking", payload: { user_id: me.id, speaking } });
    },
    [me.id],
  );

  const setVoice = useCallback(
    (next: VoicePresence | null) => {
      const previous = voice.current?.channelId;
      voice.current = next;
      if (previous !== next?.channelId) {
        voicePublic.current = null;
        voiceHold.current?.();
        voiceHold.current = null;
        if (next) {
          const channelId = next.channelId;
          // Unknown or unreadable counts as private: never announce it server-wide by mistake.
          void Promise.resolve(supabase.from("channels").select("is_private").eq("id", channelId).maybeSingle())
            .then(({ data }) => data?.is_private !== false, () => true)
            .then((isPrivate) => {
              if (voice.current?.channelId !== channelId) return;
              if (isPrivate) voiceHold.current = acquire(voiceTopic(channelId));
              else voicePublic.current = channelId;
              retrack();
            });
        }
      }
      retrack();
    },
    [supabase, acquire, retrack],
  );

  // Realtime decides whether I may publish presence when I join a topic, so topics joined while
  // invisible are rejoined once visible, but only after the server has cleared the flag (else the
  // fresh join is refused presence too). `hidden`: joins may be tainted; `confirmed`: server says visible.
  const hidden = useRef(me.status === "invisible");
  const confirmed = useRef(false);
  const rejoinAll = useCallback(() => {
    for (const topic of [...entries.current.keys()]) {
      const entry = entries.current.get(topic);
      if (!entry?.channel) continue;
      void removeChannelSafely(supabase, topic, entry.channel);
      entry.channel = null;
      entry.subscribed = false;
      entry.tracked = false;
      entry.trackedKey = null;
      connect(topic, entry);
    }
  }, [supabase, connect]);

  const rejoin = useCallback(() => {
    if (!hidden.current) return;
    // Called in the same tick as a setMe: let the status effect below finish the job.
    if (base.current.status === "invisible") return void (confirmed.current = true);
    hidden.current = false;
    rejoinAll();
  }, [rejoinAll]);

  useEffect(() => {
    base.current = { status: me.status, custom_status: me.custom_status, custom_status_emoji: me.custom_status_emoji };
    if (me.status === "invisible") {
      hidden.current = true;
      confirmed.current = false;
    } else if (hidden.current && confirmed.current) {
      hidden.current = false;
      confirmed.current = false;
      rejoinAll();
      return;
    }
    retrack();
  }, [me.status, me.custom_status, me.custom_status_emoji, retrack, rejoinAll]);

  useEffect(() => {
    const all = entries.current;
    return () => {
      voiceHold.current = null;
      for (const [topic, entry] of all) {
        if (entry.speakingTimer) clearTimeout(entry.speakingTimer);
        if (entry.channel) void removeChannelSafely(supabase, topic, entry.channel);
      }
      all.clear();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({ acquire, subscribe, snapshot, speakingSnapshot, activitySnapshot, setVoice, broadcastSpeaking, rejoin }),
    [acquire, subscribe, snapshot, speakingSnapshot, activitySnapshot, setVoice, broadcastSpeaking, rejoin],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

function usePresenceContext(): PresenceContextValue {
  const value = useContext(PresenceContext);
  if (!value) throw new Error("usePresence must be used inside <PresenceProvider>");
  return value;
}

/** Live presence map for a topic (joins its presence channel while mounted). */
export function useTopicPresence(topic: string | null): Map<string, PresencePayload> {
  const ctx = usePresenceContext();
  useEffect(() => {
    if (!topic) return;
    return ctx.acquire(topic);
  }, [ctx, topic]);
  return useSyncExternalStore(
    useCallback((listener) => (topic ? ctx.subscribe(topic, listener) : () => undefined), [ctx, topic]),
    () => (topic ? ctx.snapshot(topic) : EMPTY),
    () => EMPTY,
  );
}

/** Live presence map for a server (joins the presence channel while mounted). */
export function useServerPresence(serverId: string | null | undefined): Map<string, PresencePayload> {
  return useTopicPresence(serverId ? serverTopic(serverId) : null);
}

export function useVoicePresence() {
  return usePresenceContext().setVoice;
}

/** Who is talking on a topic right now (server-wide, or one private voice channel's). */
export function useTopicSpeaking(topic: string | null): ReadonlySet<string> {
  const ctx = usePresenceContext();
  useEffect(() => {
    if (!topic) return;
    return ctx.acquire(topic);
  }, [ctx, topic]);
  return useSyncExternalStore(
    useCallback((listener) => (topic ? ctx.subscribe(topic, listener) : () => undefined), [ctx, topic]),
    () => (topic ? ctx.speakingSnapshot(topic) : NOBODY),
    () => NOBODY,
  );
}

/** Who is talking in this server's public voice channels right now, as seen by anyone watching the server. */
export function useServerSpeaking(serverId: string | null | undefined): ReadonlySet<string> {
  return useTopicSpeaking(serverId ? serverTopic(serverId) : null);
}

export function useBroadcastSpeaking() {
  return usePresenceContext().broadcastSpeaking;
}

const noop = () => undefined;
/** Call once the server has stored a visible status (see PresenceContextValue.rejoin). No-op outside the provider. */
export function usePresenceRejoin(): () => void {
  return useContext(PresenceContext)?.rejoin ?? noop;
}

/** Sum of activity revisions over several topics (joined while mounted): any change bumps it. */
export function useTopicsRevision(topics: readonly string[]): number {
  const ctx = usePresenceContext();
  const key = topics.join(",");
  useEffect(() => {
    const releases = key ? key.split(",").map((topic) => ctx.acquire(topic)) : [];
    return () => releases.forEach((release) => release());
  }, [ctx, key]);
  return useSyncExternalStore(
    useCallback((listener) => {
      const offs = key ? key.split(",").map((topic) => ctx.subscribe(topic, listener)) : [];
      return () => offs.forEach((off) => off());
    }, [ctx, key]),
    () => (key ? key.split(",").reduce((sum, topic) => sum + ctx.activitySnapshot(topic).revision, 0) : 0),
    () => 0,
  );
}

/** Snapshot invalidations share the same ref-counted channel as presence and speaking. */
export function useServerVoiceActivity(serverId: string) {
  const ctx = usePresenceContext();
  const topic = serverTopic(serverId);
  useEffect(() => ctx.acquire(topic), [ctx, topic]);
  return useSyncExternalStore(useCallback((listener) => ctx.subscribe(topic, listener), [ctx, topic]), () => ctx.activitySnapshot(topic), () => NO_ACTIVITY);
}
