"use client";

import { reactionDisplay } from "@/lib/emoji";
import type { Reaction } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";

export function summarizeReactions(list: Reaction[], meId: string) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean; first: string }>();
  for (const r of list) {
    const entry = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, first: r.created_at };
    entry.count += 1;
    entry.mine ||= r.user_id === meId;
    if (r.created_at < entry.first) entry.first = r.created_at;
    map.set(r.emoji, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.first.localeCompare(b.first));
}

export function ReactionBar({ reactions, meId, onToggle, names }: { reactions: Reaction[]; meId: string; onToggle: (emoji: string) => void; names: (userId: string) => string }) {
  const summary = summarizeReactions(reactions, meId);
  if (summary.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="reactions">
      {summary.map((r) => {
        const { emoji, label, custom } = reactionDisplay(r.emoji);
        const who = reactions
          .filter((x) => x.emoji === r.emoji)
          .map((x) => names(x.user_id))
          .slice(0, 5)
          .join(", ");
        return (
          <button
            key={r.emoji}
            type="button"
            aria-pressed={r.mine}
            aria-label={`${label}: ${r.count} ${r.count === 1 ? "reaction" : "reactions"}`}
            title={`${custom ? label : emoji} — ${who}${r.count > 5 ? "…" : ""}`}
            onClick={() => onToggle(r.emoji)}
            className={cn(
              "flex h-7 items-center gap-1 rounded-lg border px-2 text-sm transition-colors",
              r.mine ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25",
            )}
          >
            <span className="leading-none">{emoji}</span>
            {custom && <span className="font-silk text-[9px] uppercase">{label}</span>}
            <span className="text-xs font-semibold tabular-nums">{r.count}</span>
          </button>
        );
      })}
      <EmojiPicker onPick={onToggle} triggerClassName="h-7 border border-white/10 bg-white/5" />
    </div>
  );
}
