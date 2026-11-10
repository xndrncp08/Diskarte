"use client";

import { useShellKind } from "@/components/shell/ShellKind";
import { Emote } from "@/components/ui/Emote";
import { glyphLabel } from "@/lib/glyphs";
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
  const pulse = useShellKind() === "pulse";
  const summary = summarizeReactions(reactions, meId);
  if (summary.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-testid="reactions">
      {summary.map((r) => {
        // Stored as a :code: (or a legacy emoji) — always drawn as a vector icon.
        const label = glyphLabel(r.emoji);
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
            title={`${label} — ${who}${r.count > 5 ? "…" : ""}`}
            onClick={() => onToggle(r.emoji)}
            className={
              pulse
                ? // Compact chip: icon and count. Yours: accent tint, accent edge and a bold count (not colour alone).
                  cn(
                    "reaction-chip inline-flex h-7 items-center gap-1 rounded-pulse-control border px-1.5 font-pulse-text text-pulse-label tabular-nums transition-[background-color,border-color,transform] duration-(--pulse-dur-press) pointer-coarse:min-h-11 pointer-coarse:px-2.5 pulse-motion:active:scale-95",
                    r.mine ? "border-pulse-accent-mark bg-pulse-selected font-bold text-pulse-text" : "border-pulse-line text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text",
                  )
                : cn(
                    "reaction-chip touch-target relative flex h-7 items-center gap-1 rounded-lg border px-2 text-sm transition-[color,background-color,border-color,transform] active:scale-95",
                    r.mine ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 bg-white/5 text-slate-300 hover:border-white/25",
                  )
            }
          >
            <Emote code={r.emoji} className="size-4" />
            {!pulse && <span className="font-silk text-[9px] uppercase">{label}</span>}
            <span className={pulse ? undefined : "text-xs font-semibold tabular-nums"}>{r.count}</span>
          </button>
        );
      })}
      <EmojiPicker
        onPick={onToggle}
        triggerClassName={pulse ? "inline-flex h-7 items-center rounded-pulse-control border border-pulse-line px-1.5 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text pointer-coarse:min-h-11 pointer-coarse:px-2.5" : "h-7 border border-white/10 bg-white/5"}
      />
    </div>
  );
}
