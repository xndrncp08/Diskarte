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
  state: Map<string, PresencePayload>;
  listeners: Set<() => void>;
  subscribed: boolean;
  /** Who is talking in this server's voice channels (user id → when the claim lapses), from broadcasts. */
  speakingUntil: Map<string, number>;
  speaking: ReadonlySet<string>;
  speakingTimer: ReturnType<typeof setTimeout> | null;
}

/** A "speaking" claim lapses unless refreshed — covers a missed stop event or a dropped tab. */
export const SPEAKING_TTL_MS = 3500;
const NOBODY: ReadonlySet<string> = new Set();

interface PresenceContextValue {
  acquire: (serverId: string) => () => void;
  subscribe: (serverId: string, listener: () => void) => () => void;
  snapshot: (serverId: string) => Map<string, PresencePayload>;
  speakingSnapshot: (serverId: string) => ReadonlySet<string>;
  setVoice: (voice: VoicePresence | null) => void;
  /** Ephemeral voice activity for everyone watching the server (Realtime Broadcast, never stored). */
  broadcastSpeaking: (serverId: string, speaking: boolean) => void;
}

const EMPTY = new Map<string, PresencePayload>();
const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * One private Realtime presence channel per server (`server:<id>`, authorised by RLS on
 * realtime.messages), ref-counted so the open server view and an active voice call elsewhere can
 * share it. Each client tracks a single payload per server carrying status + voice state.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const entries = useRef(new Map<string, Entry>());
  const voice = useRef<VoicePresence | null>(null);
  const base = useRef({ status: me.status, custom_status: me.custom_status, custom_status_emoji: me.custom_status_emoji });
  const authReady = useRef<Promise<void> | null>(null);

  const payloadFor = useCallback(
    (serverId: string): PresencePayload => {
      const v = voice.current?.serverId === serverId ? voice.current : null;
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

  const retrack = useCallback(
    (serverId?: string) => {
      for (const [id, entry] of entries.current) {
        if (serverId && id !== serverId) continue;
        if (entry.channel && entry.subscribed) void entry.channel.track(payloadFor(id));
      }
    },
    [payloadFor],
  );

  const acquire = useCallback(
    (serverId: string) => {
      let entry = entries.current.get(serverId);
      if (!entry) {
        const created: Entry = {
          channel: null,
          refs: 0,
          state: EMPTY,
          listeners: new Set(),
          subscribed: false,
          speakingUntil: new Map(),
          speaking: NOBODY,
          speakingTimer: null,
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
        entry = created;
        entries.current.set(serverId, created);
        authReady.current ??= supabase.realtime.setAuth();
        void authReady.current
          .then(() => whenTopicFree(`server:${serverId}`))
          .then(() => {
            if (entries.current.get(serverId) !== created || created.refs === 0) return;
            const channel = supabase.channel(`server:${serverId}`, { config: { private: true, presence: { key: me.id } } });
            created.channel = channel;
            channel
              .on("presence", { event: "sync" }, () => {
                created.state = flattenPresence(channel.presenceState<PresencePayload>() as unknown as PresenceState);
                created.listeners.forEach((l) => l());
              })
              .on("broadcast", { event: "speaking" }, ({ payload }) => {
                const event = payload as { user_id?: unknown; speaking?: unknown } | null;
                if (typeof event?.user_id !== "string" || event.user_id === me.id) return;
                if (event.speaking === true) created.speakingUntil.set(event.user_id, Date.now() + SPEAKING_TTL_MS);
                else created.speakingUntil.delete(event.user_id);
                settleSpeaking();
              })
              .subscribe((status) => {
                created.subscribed = status === "SUBSCRIBED";
                if (created.subscribed) void channel.track(payloadFor(serverId));
              });
          });
      }
      entry.refs += 1;
      const held = entry;
      return () => {
        held.refs -= 1;
        if (held.refs > 0) return;
        entries.current.delete(serverId);
        if (held.speakingTimer) clearTimeout(held.speakingTimer);
        if (held.channel) void removeChannelSafely(supabase, `server:${serverId}`, held.channel);
      };
    },
    [supabase, me.id, payloadFor],
  );

  const subscribe = useCallback((serverId: string, listener: () => void) => {
    const entry = entries.current.get(serverId);
    if (!entry) return () => undefined;
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }, []);

  const snapshot = useCallback((serverId: string) => entries.current.get(serverId)?.state ?? EMPTY, []);
  const speakingSnapshot = useCallback((serverId: string) => entries.current.get(serverId)?.speaking ?? NOBODY, []);

  const broadcastSpeaking = useCallback(
    (serverId: string, speaking: boolean) => {
      const entry = entries.current.get(serverId);
      if (!entry?.channel || !entry.subscribed) return;
      void entry.channel.send({ type: "broadcast", event: "speaking", payload: { user_id: me.id, speaking } });
    },
    [me.id],
  );

  const setVoice = useCallback(
    (next: VoicePresence | null) => {
      const previous = voice.current?.serverId;
      voice.current = next;
      if (previous && previous !== next?.serverId) retrack(previous);
      if (next) retrack(next.serverId);
    },
    [retrack],
  );

  useEffect(() => {
    base.current = { status: me.status, custom_status: me.custom_status, custom_status_emoji: me.custom_status_emoji };
    retrack();
  }, [me.status, me.custom_status, me.custom_status_emoji, retrack]);

  useEffect(() => {
    const all = entries.current;
    return () => {
      for (const [serverId, entry] of all) {
        if (entry.speakingTimer) clearTimeout(entry.speakingTimer);
        if (entry.channel) void removeChannelSafely(supabase, `server:${serverId}`, entry.channel);
      }
      all.clear();
    };
  }, [supabase]);

  const value = useMemo(
    () => ({ acquire, subscribe, snapshot, speakingSnapshot, setVoice, broadcastSpeaking }),
    [acquire, subscribe, snapshot, speakingSnapshot, setVoice, broadcastSpeaking],
  );
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

function usePresenceContext(): PresenceContextValue {
  const value = useContext(PresenceContext);
  if (!value) throw new Error("usePresence must be used inside <PresenceProvider>");
  return value;
}

/** Live presence map for a server (joins the presence channel while mounted). */
export function useServerPresence(serverId: string | null | undefined): Map<string, PresencePayload> {
  const ctx = usePresenceContext();
  useEffect(() => {
    if (!serverId) return;
    return ctx.acquire(serverId);
  }, [ctx, serverId]);
  return useSyncExternalStore(
    useCallback((listener) => (serverId ? ctx.subscribe(serverId, listener) : () => undefined), [ctx, serverId]),
    () => (serverId ? ctx.snapshot(serverId) : EMPTY),
    () => EMPTY,
  );
}

export function useVoicePresence() {
  return usePresenceContext().setVoice;
}

/** Who is talking in this server's voice channels right now, as seen by anyone watching the server. */
export function useServerSpeaking(serverId: string | null | undefined): ReadonlySet<string> {
  const ctx = usePresenceContext();
  useEffect(() => {
    if (!serverId) return;
    return ctx.acquire(serverId);
  }, [ctx, serverId]);
  return useSyncExternalStore(
    useCallback((listener) => (serverId ? ctx.subscribe(serverId, listener) : () => undefined), [ctx, serverId]),
    () => (serverId ? ctx.speakingSnapshot(serverId) : NOBODY),
    () => NOBODY,
  );
}

export function useBroadcastSpeaking() {
  return usePresenceContext().broadcastSpeaking;
}
