"use client";

import { cn } from "@/lib/utils";

const WORD = "DISKARTE";

/** Glass panel: the auth card's material everywhere it appears. */
export const GLASS_CARD = "rounded-3xl border border-white/10 bg-slate-900/50 shadow-2xl shadow-black/50 backdrop-blur-2xl";

/**
 * "DISKARTE" as clean 2D split text: one span per letter so the entrance can stagger them, with the
 * word itself exposed once to assistive tech.
 */
export function SplitWordmark({ className, as: Tag = "p" }: { className?: string; as?: "p" | "span" }) {
  return (
    <Tag className={cn("flex select-none justify-center font-black leading-none tracking-[0.22em]", className)}>
      <span className="sr-only">Diskarte</span>
      {WORD.split("").map((ch, i) => (
        <span
          key={i}
          aria-hidden
          data-reveal="letter"
          className="inline-block bg-linear-to-b from-[#FFE7A3] via-sun to-sun-deep bg-clip-text pr-[0.02em] text-transparent will-change-transform"
        >
          {ch}
        </span>
      ))}
    </Tag>
  );
}
