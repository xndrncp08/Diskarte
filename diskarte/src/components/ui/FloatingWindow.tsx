"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { isTopOverlay, pushOverlay, removeOverlay } from "./overlay-stack";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// ---- phone layout: dialogs become full-screen sheets -----------------------------------------
const PHONE_QUERY = "(max-width: 639px)";
function subscribePhone(cb: () => void) {
  const mq = window.matchMedia?.(PHONE_QUERY);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}
const isPhone = () => window.matchMedia?.(PHONE_QUERY).matches ?? false;

export function useIsPhone() {
  return useSyncExternalStore(subscribePhone, isPhone, () => false);
}

export interface FloatingWindowProps {
  open: boolean;
  onClose: () => void;
  /** Title bar text and the dialog's accessible name. */
  title: string;
  /** Identifies the dialog (data-window). */
  id: string;
  /** @deprecated Dialogs no longer move, so there's nothing to remember. */
  remember?: boolean;
  icon?: ReactNode;
  /** @deprecated Dialogs open centred. */
  anchor?: RefObject<HTMLElement | null>;
  /** Width/height classes for the dialog (desktop); the body scrolls when content overflows. */
  className?: string;
  bodyClassName?: string;
  /** Extra controls in the title bar, before the close button. */
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * A centred dialog over a dimmed backdrop (Settings, server settings, the audio mixer, media and
 * profiles), Discord-style: Escape or a click outside closes it, Tab stays inside, and focus returns
 * to what opened it. It renders through a portal, so it never unmounts what opened it — an active
 * call stays untouched. On phones it is a full-screen sheet.
 */
export function FloatingWindow(props: FloatingWindowProps) {
  // Portals need the DOM; dialogs only ever open after a user action, so render nothing on the server.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{props.open && <Dialog {...props} />}</AnimatePresence>, document.body);
}

function Dialog({ onClose, title, id, icon, className, bodyClassName, actions, children, testId }: FloatingWindowProps) {
  const titleId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const requestClose = useEffectEvent(() => onClose());

  useEffect(() => {
    const token = pushOverlay();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Everything else on the page sits behind the backdrop: out of reach of Tab, clicks and screen
    // readers until the dialog closes (menus or confirmations opened from it mount later, on top).
    const layer = frame.current?.closest("[data-window-layer]");
    const behind = Array.from(document.body.children).filter((el) => el !== layer && !el.hasAttribute("inert"));
    for (const el of behind) el.setAttribute("inert", "");
    // First [data-autofocus] or focusable element of the body (it may load lazily), else Close.
    const focusFirst = () => {
      const el = frame.current;
      const target = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector("[data-window-body]")?.querySelector<HTMLElement>(FOCUSABLE);
      if (target) target.focus();
      return Boolean(target);
    };
    if (!focusFirst()) frame.current?.querySelector<HTMLElement>("[data-window-close]")?.focus();
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => {
      if (document.activeElement?.hasAttribute("data-window-close") && focusFirst()) observer?.disconnect();
    });
    const body = frame.current?.querySelector("[data-window-body]");
    if (body) observer?.observe(body, { childList: true, subtree: true });

    const onKey = (e: KeyboardEvent) => {
      if (!isTopOverlay(token)) return; // a confirmation opened over this dialog handles its own keys
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      } else if (e.key === "Tab" && frame.current) {
        const nodes = Array.from(frame.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!frame.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      observer?.disconnect();
      document.removeEventListener("keydown", onKey);
      removeOverlay(token);
      for (const el of behind) el.removeAttribute("inert");
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
    };
  }, []);

  return (
    <motion.div
      className={cn("overlay-viewport fixed inset-0 z-[45] flex items-center justify-center", !phone && "bg-black/60 p-4")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
      transition={{ duration: 0.15 }}
      onPointerDown={(e) => {
        // A press on the backdrop itself (not inside the dialog, nor a menu portalled above it).
        if (e.target === e.currentTarget) onClose();
      }}
      data-window-layer=""
    >
      <motion.div
        ref={frame}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-window={id}
        data-testid={testId}
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          "flex flex-col overflow-hidden border border-white/10 bg-midnight text-slate-100 shadow-2xl shadow-black/60",
          phone ? "pt-safe fixed inset-0 rounded-none" : cn("max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-2xl", className),
        )}
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.04] pl-3 pr-1.5 pointer-coarse:h-12">
          {icon && <span className="shrink-0 text-sun [&_svg]:size-4">{icon}</span>}
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-silk text-[11px] uppercase tracking-widest text-slate-300">
            {title}
          </h2>
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-window-close=""
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div data-window-body="" className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
