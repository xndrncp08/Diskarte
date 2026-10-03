"use client";

import { Sun, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Glyph } from "@/components/ui/Glyph";
import { CLASSIC_REACTIONS, PINOY_REACTIONS } from "@/lib/emoji";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "pinoy", label: "Pinoy", icon: Sun, list: PINOY_REACTIONS },
  { id: "classic", label: "Classic", icon: ThumbsUp, list: CLASSIC_REACTIONS },
] as const;

/** Tabs + search + grid of icon reactions (lazily loaded by EmojiPicker). Vector icons only — no emoji. */
export function EmojiPickerPanel({ onPick }: { onPick: (value: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pinoy");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // Searching looks through every reaction, whichever tab is open.
  const list = q ? [...PINOY_REACTIONS, ...CLASSIC_REACTIONS].filter((r) => r.label.toLowerCase().includes(q) || r.code.includes(q)) : TABS.find((t) => t.id === tab)!.list;

  return (
    <>
      <div className="mb-2 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id && !q}
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-xs font-semibold", tab === t.id && !q ? "bg-sun text-abyss" : "text-slate-300 hover:bg-white/10")}
          >
            <t.icon className="size-3.5" aria-hidden /> {t.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search: petmalu, lodi…"
        aria-label="Search reactions"
        className="mb-2 h-8 w-full rounded-md border border-white/10 bg-black/40 px-2 text-sm outline-none focus:border-sun/60 pointer-coarse:h-11 pointer-coarse:text-base"
        autoFocus
      />
      <div className="scrollbar-thin grid max-h-56 grid-cols-6 gap-1 overflow-y-auto overscroll-contain">
        {list.map((r) => (
          <button
            key={r.code}
            type="button"
            title={`${r.label} ${r.code}`}
            aria-label={r.label}
            onClick={() => onPick(r.code)}
            className="flex flex-col items-center rounded-md p-1 transition-[transform,background-color] duration-150 hover:scale-110 hover:bg-white/10 motion-reduce:hover:scale-100"
          >
            <Glyph code={r.code} className="size-6" />
            <span className="mt-0.5 w-full truncate text-center font-silk text-[8px] uppercase text-slate-400">{r.label}</span>
          </button>
        ))}
        {list.length === 0 && <p className="col-span-6 py-4 text-center text-xs text-slate-500">No reactions match “{query}”.</p>}
      </div>
    </>
  );
}
