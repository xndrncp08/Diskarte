"use client";

import { AnimatePresence } from "framer-motion";
import { SmilePlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";

/** The reaction grid is its own chunk, fetched the first time any picker opens. */
const EmojiPickerPanel = dynamic(() => import("./EmojiPickerPanel").then((m) => m.EmojiPickerPanel), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-lg bg-white/5" aria-busy="true" aria-label="Loading emoji" data-testid="emoji-skeleton" />,
});
import { cn } from "@/lib/utils";

/**
 * Reaction picker with a Filipino tab (custom :shortcode: reactions) and classic emoji.
 * Portalled to <body> with fixed positioning: it flips above/below the trigger and is clamped to
 * the viewport, so scrolling message lists or the composer's rounded card can't clip it.
 */
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
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const { style, side } = useFloating(open, trigger, panel, { side: placement, align: align === "end" ? "end" : "start" });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(value: string) {
    onPick(value);
    setOpen(false);
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn("touch-target relative rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white", triggerClassName)}
      >
        <SmilePlus className="size-4" aria-hidden />
      </button>
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <InertWhenExiting
              ref={panel}
              id={panelId}
              role="dialog"
              aria-label="Emoji picker"
              data-side={side}
              data-floating="emoji-picker"
              style={style}
              initial={{ opacity: 0, scale: 0.96, y: side === "top" ? 4 : -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="glass-strong z-50 w-72 max-w-[calc(100vw-1rem)] rounded-xl p-2 shadow-2xl shadow-black/60"
            >
              <EmojiPickerPanel onPick={pick} />
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </div>
  );
}
