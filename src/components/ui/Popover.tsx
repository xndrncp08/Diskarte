"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { FloatingPortal, useFloating, type Side } from "./floating";
import { InertWhenExiting } from "./InertWhenExiting";

export interface PopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  open: boolean;
  toggle: () => void;
  "aria-expanded": boolean;
  "aria-haspopup": "dialog";
  "aria-controls": string | undefined;
}

/**
 * Non-modal dialog anchored to a trigger (sticker picker, soundboard, activities…). Portalled to
 * <body> on the floating layer so scroll containers can't clip it; flips when there's no room;
 * closes on outside click or Escape (returning focus to the trigger).
 */
export function Popover({
  label,
  trigger,
  children,
  side = "top",
  align = "end",
  className,
  testId,
}: {
  label: string;
  trigger: (props: PopoverTriggerProps) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  side?: Side;
  align?: "start" | "end";
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const floating = useFloating(open, triggerRef, panel, { side, align, offset: 8 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      {trigger({
        ref: triggerRef,
        open,
        toggle: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": open ? id : undefined,
      })}
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <InertWhenExiting
              ref={panel}
              id={id}
              role="dialog"
              aria-label={label}
              data-floating={testId ?? "popover"}
              data-side={floating.side}
              style={floating.style}
              initial={{ opacity: 0, y: floating.side === "top" ? 6 : -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.13 }}
              className={cn("glass-strong z-50 max-w-[calc(100vw-1rem)] rounded-2xl p-3 shadow-2xl shadow-black/60", className)}
            >
              {typeof children === "function" ? children(close) : children}
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
