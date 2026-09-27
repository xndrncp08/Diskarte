"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pin, PinOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { UserAvatar } from "@/components/profile/UserAvatar";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { MESSAGE_SELECT, parseAttachments, type MessageWithAuthor } from "@/lib/messages";
import { MessageMarkdown } from "./MessageMarkdown";
import { Timestamp } from "./Timestamp";

/** Right-hand drawer listing every pinned message in the channel (fetched on open, kept live). */
export function PinsDrawer({
  open,
  onClose,
  channelId,
  livePinned,
  liveIds,
  canModerate,
  onUnpin,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
  livePinned: ChatMessage[];
  liveIds: Set<string>;
  canModerate: boolean;
  onUnpin: (id: string) => void;
  onJump: (id: string) => void;
}) {
  const supabase = useSupabase();
  const [fetched, setFetched] = useState<MessageWithAuthor[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("channel_id", channelId)
      .eq("pinned", true)
      .order("pinned_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) setFetched((data ?? []) as unknown as MessageWithAuthor[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, supabase, channelId]);

  // Loaded messages are authoritative (realtime); fetched ones cover older history.
  const merged = new Map<string, MessageWithAuthor>();
  for (const m of fetched ?? []) if (!liveIds.has(m.id)) merged.set(m.id, m);
  for (const m of livePinned) merged.set(m.id, m);
  const list = Array.from(merged.values()).sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""));

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label="Pinned messages"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="glass-strong absolute right-2 top-14 z-30 flex max-h-[70vh] w-[min(24rem,calc(100%-1rem))] flex-col rounded-2xl shadow-2xl shadow-black/60"
          data-testid="pins-drawer"
        >
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="flex items-center gap-2 font-bold text-white">
              <Pin className="size-4 text-sun" aria-hidden /> Pinned messages
            </h2>
            <button type="button" aria-label="Close pins" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
            {fetched === null && list.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-400">Naglo-load…</p>
            ) : list.length === 0 ? (
              <div className="p-6 text-center">
                <p className="font-pixel text-[9px] text-sun">WALANG PINS</p>
                <p className="mt-2 text-sm text-slate-400">Wala pang naka-pin dito. Mods can pin important messages.</p>
              </div>
            ) : (
              list.map((m) => (
                <article key={m.id} className="group rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    {m.author && <UserAvatar profile={m.author} size={24} />}
                    <span className="truncate text-sm font-semibold text-white">{m.author?.display_name ?? "Deleted user"}</span>
                    <Timestamp iso={m.created_at} className="shrink-0 text-[11px] text-slate-500" />
                  </div>
                  {m.content ? <MessageMarkdown content={m.content} /> : <p className="text-sm italic text-slate-400">{parseAttachments(m.attachments).length} attachment(s)</p>}
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => onJump(m.id)} className="text-xs font-semibold text-sky-300 hover:underline">
                      Jump
                    </button>
                    {canModerate && (
                      <button type="button" onClick={() => onUnpin(m.id)} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-300">
                        <PinOff className="size-3" aria-hidden /> Unpin
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
