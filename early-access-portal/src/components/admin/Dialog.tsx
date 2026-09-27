"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { EASE_OUT } from "@/components/motion/MotionRoot";
import { useIsCompact } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal that becomes a **bottom sheet** on phones: it slides up from the thumb zone,
 * has a drag handle, and can be flung down to dismiss. On larger screens it's a centred dialog
 * that springs in. Portal, focus trap, Escape/backdrop close and focus restore either way.
 */
export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const compact = useIsCompact();
  const drag = useDragControls();

  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab" && panel.current) {
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!nodes.length) return;
        const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-50 flex justify-center", compact ? "items-end" : "items-center p-4")}>
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-sheet={compact || undefined}
            initial={compact ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 12 }}
            animate={compact ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={compact ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={compact ? { type: "spring", stiffness: 380, damping: 36 } : { duration: 0.22, ease: EASE_OUT }}
            drag={compact ? "y" : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            className={cn(
              "glass-strong relative w-full overflow-y-auto shadow-2xl",
              compact ? "max-h-[88dvh] rounded-t-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2" : "max-h-[90dvh] max-w-2xl rounded-3xl p-6",
              className,
            )}
          >
            {compact && (
              <div className="flex justify-center pb-2 pt-1" onPointerDown={(e) => drag.start(e)} style={{ touchAction: "none" }}>
                <span className="h-1.5 w-12 cursor-grab rounded-full bg-white/25" aria-hidden />
              </div>
            )}
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id={titleId} className="text-xl font-extrabold text-white">
                {title}
              </h2>
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
