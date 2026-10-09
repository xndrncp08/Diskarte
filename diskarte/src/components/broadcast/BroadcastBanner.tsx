"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, Info, Megaphone, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { HQ_CHANNELS, HQ_SERVER_ID, isStickyLive, type Broadcast, type BroadcastTone } from "@/lib/admin";
import { subscribeDbChanges } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "diskarte:broadcasts-dismissed";

export const TONE_ICON: Record<BroadcastTone, ReactNode> = {
  info: <Info className="size-4" aria-hidden />,
  success: <CircleCheck className="size-4" aria-hidden />,
  warning: <TriangleAlert className="size-4" aria-hidden />,
  critical: <OctagonAlert className="size-4" aria-hidden />,
};

export const TONE_STYLE: Record<BroadcastTone, string> = {
  info: "border-neon/40 text-neon",
  success: "border-signal-green/40 text-signal-green",
  warning: "border-sun/50 text-sun",
  critical: "border-signal-dnd/50 text-signal-dnd",
};

/** One line of plain text from a broadcast's Markdown (headers, callout markers and fences removed). */
export function excerpt(markdown: string, max = 160): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*>\s?\[![A-Za-z]+\]\s*/gm, "")
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function broadcastHref(b: Pick<Broadcast, "targets">) {
  const target = b.targets.includes("announcements") ? "announcements" : (b.targets[0] ?? "announcements");
  return `/tambayan/${HQ_SERVER_ID}/${HQ_CHANNELS[target]}`;
}

function readDismissed(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

/**
 * Live system broadcasts for this canvas: the current sticky banners, kept in sync over the private
 * `db:broadcasts:<HQ>` topic, plus a toast whenever a new announcement goes out — no reload needed.
 */
export function useLiveBroadcasts(): Broadcast[] {
  const supabase = useSupabase();
  const { me } = useMe();
  const [items, setItems] = useState<Broadcast[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(
      supabase.from("system_broadcasts").select("*").eq("sticky", true).is("retracted_at", null).order("created_at", { ascending: false }).limit(5),
    ).then(({ data }) => {
      if (!cancelled && data) setItems((current) => merge(current, data as unknown as Broadcast[]));
    }, () => undefined);

    const unsubscribe = subscribeDbChanges(supabase, `broadcasts:${HQ_SERVER_ID}`, (channel) =>
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_broadcasts" }, ({ new: row }) => {
          const b = row as Broadcast;
          setItems((current) => merge(current, [b]));
          if (b.author_id !== me.id) {
            toast(b.title, { description: excerpt(b.body, 90) || "New announcement from the Diskarte team", icon: <Megaphone className="size-4 text-sun" aria-hidden /> });
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "system_broadcasts" }, ({ new: row }) => setItems((current) => merge(current, [row as Broadcast]))),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [supabase, me.id]);

  return items;
}

function merge(current: Broadcast[], incoming: Broadcast[]): Broadcast[] {
  const byId = new Map(current.map((b) => [b.id, b]));
  for (const b of incoming) byId.set(b.id, { ...byId.get(b.id), ...b });
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);
}

/** Re-renders once a minute so sticky banners disappear when they expire. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** The glass banner itself (also used by the composer's live preview). */
export function BannerCard({ broadcast, onDismiss, preview = false }: { broadcast: Pick<Broadcast, "title" | "body" | "tone" | "targets">; onDismiss?: () => void; preview?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border border-l-4 bg-slate-900/70 py-2 pl-3 pr-2 shadow-xl shadow-black/40 backdrop-blur-2xl",
        TONE_STYLE[broadcast.tone],
      )}
    >
      <span className="shrink-0">{TONE_ICON[broadcast.tone]}</span>
      <p className="min-w-0 flex-1 truncate text-sm text-slate-300">
        <span className="font-bold text-white">{broadcast.title}</span>
        {excerpt(broadcast.body) && <span className="text-slate-400"> — {excerpt(broadcast.body)}</span>}
      </p>
      {preview ? (
        <span className="shrink-0 font-silk text-[10px] uppercase tracking-widest text-slate-500">Preview</span>
      ) : (
        <Link href={broadcastHref(broadcast)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white">
          Read
        </Link>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss announcement" className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * The sticky global banner along the top of every signed-in canvas: the newest live sticky
 * broadcast this person hasn't dismissed. Taking it down in the Control Center removes it everywhere.
 */
export function BroadcastBanner() {
  const broadcasts = useLiveBroadcasts();
  const now = useMinuteClock();
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    // Storage is only readable after mount (the server render has no localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(readDismissed());
  }, []);

  const current = broadcasts.find((b) => isStickyLive(b, now) && !dismissed.includes(b.id));

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Blocked storage: dismissed for this visit only.
    }
  };

  return (
    <div aria-live="polite" className="shrink-0 empty:hidden max-md:px-2 max-md:pt-2">
      <AnimatePresence initial={false}>
        {current && (
          <motion.section
            key={current.id}
            aria-label="Announcement"
            data-testid="broadcast-banner"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <BannerCard broadcast={current} onDismiss={() => dismiss(current.id)} />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
