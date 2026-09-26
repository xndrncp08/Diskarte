"use client";

import { useState } from "react";
import { CLASSIC_EMOJI, PINOY_REACTIONS } from "@/lib/emoji";
import { cn } from "@/lib/utils";

/** Tabs + search + grid for the reaction picker (lazily loaded by EmojiPicker). */
export function EmojiPickerPanel({ onPick }: { onPick: (value: string) => void }) {
  const [tab, setTab] = useState<"pinoy" | "classic">("pinoy");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const pinoy = PINOY_REACTIONS.filter((r) => !q || r.label.toLowerCase().includes(q) || r.code.includes(q));
  const pick = onPick;

  return (
    <>
      <div className="mb-2 flex gap-1">
        {(
          [
            ["pinoy", "🇵🇭 Pinoy"],
            ["classic", "😀 Classic"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn("flex-1 rounded-md py-1 text-xs font-semibold", tab === key ? "bg-sun text-abyss" : "text-slate-300 hover:bg-white/10")}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "pinoy" && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hanapin: petmalu, lodi…"
          aria-label="Search reactions"
          className="mb-2 h-8 w-full rounded-md border border-white/10 bg-black/40 px-2 text-sm outline-none focus:border-sun/60"
          autoFocus
        />
      )}
      <div className="scrollbar-thin grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
        {tab === "pinoy"
          ? pinoy.map((r) => (
              <button
                key={r.code}
                type="button"
                title={`${r.label} ${r.code}`}
                aria-label={r.label}
                onClick={() => pick(r.code)}
                className="flex flex-col items-center rounded-md p-1 transition-transform hover:scale-110 hover:bg-white/10"
              >
                <span className="text-xl leading-none">{r.emoji}</span>
                <span className="mt-0.5 w-full truncate text-center font-silk text-[8px] uppercase text-slate-400">{r.label}</span>
              </button>
            ))
          : CLASSIC_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={e}
                onClick={() => pick(e)}
                className="rounded-md p-1 text-xl transition-transform hover:scale-110 hover:bg-white/10"
              >
                {e}
              </button>
            ))}
      </div>
    </>
  );
}
