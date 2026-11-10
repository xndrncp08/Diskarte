"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "@/components/ui/FloatingWindow";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";
import { useModalBehaviour } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

const EASE = [0.23, 1, 0.32, 1] as const; // --pulse-ease

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading and the dialog's accessible name. */
  title: string;
  /** Linked with aria-describedby. */
  description?: ReactNode;
  children: ReactNode;
  /** Actions row (Pulse Buttons), end-aligned on wide screens. */
  footer?: ReactNode;
  className?: string;
}

function Header({ titleId, descId, title, description, onClose }: { titleId: string; descId: string; title: string; description?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1 pt-1">
        <h2 id={titleId} className="font-pulse-display text-pulse-title font-semibold text-pulse-text">
          {title}
        </h2>
        {description && (
          <div id={descId} className="mt-1 font-pulse-text text-pulse-body text-pulse-muted">
            {description}
          </div>
        )}
      </div>
      <IconButton label="Close" icon={<X />} size="sm" onClick={onClose} className="-mr-1" />
    </div>
  );
}

/**
 * Pulse dialog: Modal's behaviour (useModalBehaviour: overlay stack, focus to the first [data-autofocus] or
 * focusable element, Tab trap, Escape closes only the topmost overlay, scroll lock, focus restored) on a
 * scrim with a centred surface card. For a decision or short form; longer context belongs in a <Sheet>.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: OverlayProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useModalBehaviour(open, panel, onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <InertWhenExiting className="overlay-viewport fixed inset-0 z-(--pulse-z-overlay) flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-pulse-scrim" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            className={cn("relative w-full max-w-md rounded-pulse-card border border-pulse-line bg-pulse-surface p-5 font-pulse-text text-pulse-text shadow-pulse-3", className)}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <Header titleId={titleId} descId={descId} title={title} description={description} onClose={onClose} />
            <div className="mt-4 text-pulse-body">{children}</div>
            {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </InertWhenExiting>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Pulse sheet: the Context sheet and other secondary panels. A side sheet from the right on wider screens,
 * a bottom sheet (grabber, rounded top, safe-area padding, keyboard-aware height) on phones. Same modal
 * behaviour as Dialog (useModalBehaviour), scrim behind; slides in over --pulse-dur-sheet, instantly when
 * reduced motion is on (framer MotionConfig). The body scrolls; header and footer stay put.
 */
export function Sheet({ open, onClose, title, description, children, footer, className }: OverlayProps) {
  const titleId = useId();
  const descId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  useModalBehaviour(open, panel, onClose);
  if (typeof document === "undefined") return null;
  const offscreen = phone ? { y: "100%" } : { x: "100%" };
  return createPortal(
    <AnimatePresence>
      {open && (
        <InertWhenExiting className={cn("fixed inset-0 z-(--pulse-z-overlay)", phone && "overlay-viewport")} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-pulse-scrim" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            data-sheet={phone ? "bottom" : "side"}
            className={cn(
              "absolute flex flex-col border-pulse-line bg-pulse-surface font-pulse-text text-pulse-text shadow-pulse-3",
              phone ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-pulse-sheet border-t pb-safe" : "inset-y-0 right-0 w-full max-w-md rounded-l-pulse-sheet border-l",
              className,
            )}
            initial={offscreen}
            animate={{ x: 0, y: 0 }}
            exit={offscreen}
            transition={{ duration: 0.32, ease: EASE }}
          >
            {phone && <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-pulse-line-strong" aria-hidden />}
            <div className="shrink-0 border-b border-pulse-line px-5 pb-3 pt-4">
              <Header titleId={titleId} descId={descId} title={title} description={description} onClose={onClose} />
            </div>
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 text-pulse-body">{children}</div>
            {footer && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-pulse-line px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </InertWhenExiting>
      )}
    </AnimatePresence>,
    document.body,
  );
}
