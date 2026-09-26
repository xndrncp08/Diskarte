"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CLASSIC_EMOJI, PINOY_REACTIONS } from "@/lib/emoji";
import { cn } from "@/lib/utils";

/** Reaction picker with a Filipino tab (custom :shortcode: reactions) and classic emoji. */
export function EmojiPicker({
  onPick,
  label = "Add reaction",
  align = "end",
  triggerClassName,
  placement = "top",
}: {
  onPick: (value: string) => void;
  label?: string;
  align?: "start" | "end";
  triggerClassName?: string;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pinoy" | "classic">("pinoy");
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const pinoy = PINOY_REACTIONS.filter((r) => !q || r.label.toLowerCase().includes(q) || r.code.includes(q));

  function pick(value: string) {
    onPick(value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white", triggerClassName)}
      >
        <SmilePlus className="size-4" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Emoji picker"
            initial={{ opacity: 0, scale: 0.96, y: placement === "top" ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "glass-strong absolute z-50 w-72 rounded-xl p-2 shadow-2xl shadow-black/60",
              placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
              align === "end" ? "right-0" : "left-0",
            )}
          >
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
                    <button key={e} type="button" aria-label={e} onClick={() => pick(e)} className="rounded-md p-1 text-xl transition-transform hover:scale-110 hover:bg-white/10">
                      {e}
                    </button>
                  ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
