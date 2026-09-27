"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";

const TYPING_TTL_MS = 6000;
const SEND_EVERY_MS = 2500;

interface TypingEvent {
  user_id: string;
  name: string;
}

/** Typing indicators over a private broadcast topic `channel:<id>` (authorised by RLS). */
export function useTyping(channelId: string) {
  const supabase = useSupabase();
  const { me } = useMe();
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase.channel(`channel:${channelId}`, { config: { private: true, broadcast: { self: false } } });
      channelRef.current = channel;
      channel
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const event = payload as TypingEvent;
          if (!event?.user_id || event.user_id === me.id) return;
          setTyping((prev) => ({ ...prev, [event.user_id]: { name: String(event.name).slice(0, 32), until: Date.now() + TYPING_TTL_MS } }));
        })
        .on("broadcast", { event: "stop" }, ({ payload }) => {
          const id = (payload as TypingEvent)?.user_id;
          if (!id) return;
          setTyping((prev) => {
            if (!prev[id]) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
        })
        .subscribe();
    });

    const sweep = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const entries = Object.entries(prev).filter(([, v]) => v.until > now);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(sweep);
      channelRef.current = null;
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase, channelId, me.id]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { user_id: me.id, name: me.display_name } });
  }, [me.id, me.display_name]);

  const stopTyping = useCallback(() => {
    if (!lastSent.current) return;
    lastSent.current = 0;
    void channelRef.current?.send({ type: "broadcast", event: "stop", payload: { user_id: me.id, name: me.display_name } });
  }, [me.id, me.display_name]);

  return { typingNames: Object.values(typing).map((t) => t.name), notifyTyping, stopTyping };
}

export function typingLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} at ${names[1]} are typing…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} at ${names[2]} are typing…`;
  return "Maraming nagta-type…";
}
