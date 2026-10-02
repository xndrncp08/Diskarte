"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Phone, PhoneOff, Video, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cancelRingsAction, respondRingAction, ringAction } from "@/actions/calls";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { subscribeDbChanges } from "@/lib/realtime";
import { playSfx } from "@/lib/sfx";
import { SOCIAL_PROFILE_COLUMNS, type SocialProfile } from "@/lib/social";
import type { Tables } from "@/lib/supabase/database.types";
import { callHref, useCall, type CallTarget } from "./CallProvider";

type Ring = Tables<"call_rings">;

/** What the pop-up shows about a ring: who is calling, and into what. */
interface RingCard {
  ring: Ring;
  caller: SocialProfile | null;
  /** Group DM name, or "#channel · Server" for a voice ping. */
  context: { serverName?: string; channelName?: string; groupName?: string | null };
}

const RING_EVERY_MS = 2600;

interface RingerValue {
  /** Ring the other people in a DM call you just started. */
  ringDm: (conversationId: string, video?: boolean) => Promise<void>;
  /** Ping a server member to join the voice channel you're in. */
  ringToVoice: (calleeId: string, calleeName: string) => Promise<void>;
}

const RingerContext = createContext<RingerValue | null>(null);

export function useRinger(): RingerValue | null {
  return useContext(RingerContext);
}

/**
 * Incoming-call pop-ups and outgoing rings for the app shell (inside <CallProvider>). Each user
 * listens on their private `db:rings:<me>` topic: new rings pop up with the caller's avatar, a
 * looping 8-bit chime and Accept / Decline; the caller hears about declines, and their unanswered
 * rings are cancelled when they hang up.
 */
export function IncomingCallsProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const call = useCall();
  const router = useRouter();
  const [cards, setCards] = useState<RingCard[]>([]);
  const outgoing = useRef(new Set<string>());
  const callees = useRef(new Map<string, string>());

  const describe = useCallback(
    async (ring: Ring): Promise<RingCard> => {
      const [{ data: caller }, context] = await Promise.all([
        supabase.from("profiles").select(SOCIAL_PROFILE_COLUMNS).eq("id", ring.caller_id).maybeSingle(),
        (async (): Promise<RingCard["context"]> => {
          if (ring.kind === "voice" && ring.server_id && ring.channel_id) {
            const [{ data: srv }, { data: channel }] = await Promise.all([
              supabase.from("servers").select("name").eq("id", ring.server_id).maybeSingle(),
              supabase.from("channels").select("name").eq("id", ring.channel_id).maybeSingle(),
            ]);
            return { serverName: srv?.name, channelName: channel?.name };
          }
          if (ring.conversation_id) {
            const { data: conv } = await supabase.from("dm_conversations").select("kind, name").eq("id", ring.conversation_id).maybeSingle();
            return { groupName: conv?.kind === "group" ? (conv.name ?? "Group DM") : null };
          }
          return {};
        })(),
      ]);
      return { ring, caller: (caller as SocialProfile | null) ?? null, context };
    },
    [supabase],
  );

  const add = useCallback(
    async (ring: Ring) => {
      if (ring.callee_id !== me.id || ring.status !== "ringing" || Date.parse(ring.expires_at) <= Date.now()) return;
      const card = await describe(ring);
      setCards((prev) => (prev.some((c) => c.ring.id === ring.id) ? prev : [...prev, card]));
    },
    [describe, me.id],
  );

  const remove = useCallback((ringId: string) => setCards((prev) => prev.filter((c) => c.ring.id !== ringId)), []);

  // Rings already active when the app loads, then live ones.
  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("call_rings")
      .select("*")
      .eq("callee_id", me.id)
      .eq("status", "ringing")
      .gt("expires_at", new Date().toISOString())
      .then(({ data }) => {
        if (!cancelled) for (const ring of (data ?? []) as Ring[]) void add(ring);
      });
    const unsubscribe = subscribeDbChanges(supabase, `rings:${me.id}`, (channel) =>
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "call_rings", filter: `callee_id=eq.${me.id}` }, ({ new: row }) => void add(row as Ring))
        // Answered on another device, or the caller hung up.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "call_rings", filter: `callee_id=eq.${me.id}` }, ({ new: row }) => {
          if ((row as Ring).status !== "ringing") remove((row as Ring).id);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "call_rings", filter: `caller_id=eq.${me.id}` }, ({ new: row }) => {
          const ring = row as Ring;
          if (ring.status !== "declined") return;
          const known = callees.current.get(ring.callee_id);
          if (known) toast(`${known} declined the call.`);
          else
            void supabase
              .from("profiles")
              .select("display_name")
              .eq("id", ring.callee_id)
              .maybeSingle()
              .then(({ data }) => toast(`${data?.display_name ?? "They"} declined the call.`));
        }),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [supabase, me.id, add, remove]);

  // Drop rings as they run out.
  useEffect(() => {
    if (cards.length === 0) return;
    const next = Math.min(...cards.map((c) => Date.parse(c.ring.expires_at)));
    const timer = setTimeout(() => setCards((prev) => prev.filter((c) => Date.parse(c.ring.expires_at) > Date.now())), Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [cards]);

  // Hanging up cancels whatever we were still ringing.
  const target = call.status === "idle" ? null : (call.target?.channelId ?? null);
  useEffect(() => {
    const pending = outgoing.current;
    return () => {
      for (const t of pending) void cancelRingsAction({ target: t });
      pending.clear();
    };
  }, [target]);

  const ringDm = useCallback(async (conversationId: string, video = false) => {
    const result = await ringAction({ kind: "dm", conversationId, video });
    if (result.ok) outgoing.current.add(conversationId);
    else toast.error(result.error ?? "Couldn't ring.");
  }, []);

  const ringToVoice = useCallback(
    async (calleeId: string, calleeName: string) => {
      const channelId = call.target?.kind !== "dm" ? call.target?.channelId : undefined;
      if (!channelId || call.status === "idle") {
        toast.error("Join a voice channel first, then ring people into it.");
        return;
      }
      callees.current.set(calleeId, calleeName);
      const result = await ringAction({ kind: "voice", channelId, calleeId });
      if (!result.ok) toast.error(result.error ?? "Couldn't ring.");
      else {
        outgoing.current.add(channelId);
        toast(result.data?.rang ? `Ringing ${calleeName}…` : `${calleeName} is already being rung.`);
      }
    },
    [call.target, call.status],
  );

  async function respond(card: RingCard, accept: boolean) {
    remove(card.ring.id);
    const result = await respondRingAction({ ringId: card.ring.id, accept });
    if (!accept) return;
    if (!result.ok || result.data?.status !== "accepted") {
      toast(result.error ?? "That call has ended.");
      return;
    }
    const ring = card.ring;
    const callerName = card.caller?.display_name ?? "Direct call";
    const next: CallTarget =
      ring.kind === "dm"
        ? { kind: "dm", serverId: "", serverName: "Direct Message", channelId: ring.conversation_id!, channelName: card.context.groupName ?? callerName }
        : { serverId: ring.server_id!, serverName: card.context.serverName ?? "Server", channelId: ring.channel_id!, channelName: card.context.channelName ?? "Voice" };
    void call.join(next);
    router.push(callHref(next));
  }

  const value = useMemo(() => ({ ringDm, ringToVoice }), [ringDm, ringToVoice]);
  const current = cards[0];

  return (
    <RingerContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {current && (
          <IncomingCallCard
            key={current.ring.id}
            card={current}
            more={cards.length - 1}
            silent={me.status === "dnd"}
            onAccept={() => void respond(current, true)}
            onDecline={() => void respond(current, false)}
          />
        )}
      </AnimatePresence>
    </RingerContext.Provider>
  );
}

function IncomingCallCard({
  card,
  more,
  silent,
  onAccept,
  onDecline,
}: {
  card: RingCard;
  more: number;
  silent: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const name = card.caller?.display_name ?? "Someone";
  const voicePing = card.ring.kind === "voice";
  const headline = voicePing ? `${name} wants you in voice` : card.ring.video ? `${name} is video calling you` : `${name} is calling you`;
  const detail = voicePing
    ? `🔊 ${card.context.channelName ?? "Voice"} · ${card.context.serverName ?? "Server"}`
    : card.context.groupName
      ? `in ${card.context.groupName}`
      : card.ring.video
        ? "Video call"
        : "Voice call";

  // Chime now and on a loop while it rings (silent in Do Not Disturb).
  useEffect(() => {
    if (silent) return;
    playSfx("ring");
    const loop = setInterval(() => playSfx("ring"), RING_EVERY_MS);
    return () => clearInterval(loop);
  }, [silent]);

  return (
    <motion.div
      role="dialog"
      aria-modal="false"
      aria-label={`Incoming call from ${name}`}
      data-testid="incoming-call"
      initial={{ opacity: 0, y: -24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[55] mx-auto w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 px-5 pb-5 pt-7 text-center shadow-2xl shadow-black/60 backdrop-blur-xl"
    >
      <p className="sr-only" role="alert">
        {headline}. {detail}.
      </p>
      <div className="relative mx-auto mb-4 flex size-24 items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-signal-green/60"
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
          />
        ))}
        <motion.div animate={{ rotate: [0, -6, 6, -6, 6, 0] }} transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.4 }}>
          {card.caller ? (
            <UserAvatar profile={card.caller} size={80} ring="#0b1020" />
          ) : (
            <span className="flex size-20 items-center justify-center rounded-full bg-white/10 text-2xl">📞</span>
          )}
        </motion.div>
      </div>
      <p className="font-pixel text-[9px] text-signal-green">{voicePing ? "VOICE PING" : card.ring.video ? "INCOMING VIDEO CALL" : "INCOMING CALL"}</p>
      <p className="mt-1.5 text-lg font-extrabold leading-tight text-white">{headline}</p>
      <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-400">
        {card.ring.video ? <Video className="size-3.5" aria-hidden /> : voicePing ? <Volume2 className="size-3.5" aria-hidden /> : null}
        {detail}
      </p>
      {more > 0 && <p className="mt-1 text-xs text-slate-500">+{more} more ringing</p>}
      <div className="mt-5 flex justify-center gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onDecline}
            aria-label="Decline"
            className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_4px_0_0_#7f1d1d] transition-transform hover:bg-red-400 active:translate-y-1 active:shadow-none"
          >
            <PhoneOff className="size-6" aria-hidden />
          </button>
          <span className="text-xs font-semibold text-red-300" aria-hidden>
            Decline
          </span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onAccept}
            aria-label={voicePing ? "Accept and join voice" : "Accept"}
            className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_4px_0_0_#065f46] transition-transform hover:bg-emerald-400 active:translate-y-1 active:shadow-none"
          >
            {card.ring.video ? <Video className="size-6" aria-hidden /> : <Phone className="size-6" aria-hidden />}
          </button>
          <span className="text-xs font-semibold text-emerald-300" aria-hidden>
            Accept
          </span>
        </div>
      </div>
    </motion.div>
  );
}
