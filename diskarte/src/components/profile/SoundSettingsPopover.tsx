"use client";

import { AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSfxSettings } from "@/hooks/useSfxSettings";
import { LowDataToggle } from "./LowDataToggle";
import { SoundSettings } from "./SoundSettings";

/** Speaker button in the user panel that opens the sound settings. */
export function SoundSettingsPopover() {
  const settings = useSfxSettings();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const { style, side } = useFloating(open, trigger, panel, { side: "top", align: "end", offset: 10 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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

  const Icon = settings.enabled && settings.volume > 0 ? Volume2 : VolumeX;
  return (
    <>
      <Tooltip label="Sound settings" side="top" disabled={open}>
        <button
          ref={trigger}
          type="button"
          aria-label="Sound settings"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="touch-target relative rounded-md p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:p-3.5"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </Tooltip>
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <InertWhenExiting
              ref={panel}
              id={id}
              role="dialog"
              aria-label="Sound settings"
              data-floating="sound-settings"
              data-side={side}
              style={style}
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="glass-strong z-50 w-72 max-w-[calc(100vw-1rem)] rounded-2xl p-4 shadow-2xl shadow-black/60"
            >
              <SoundSettings />
              <LowDataToggle className="mt-4 border-t border-white/10 pt-4" />
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
