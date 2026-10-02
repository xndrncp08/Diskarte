"use client";

import { AnimatePresence, motion } from "framer-motion";
import { GripHorizontal, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { computeFloatingPosition } from "./floating";
import { isTopOverlay, pushOverlay, raiseOverlay, removeOverlay } from "./overlay-stack";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** Keep at least this much of a window on screen so its title bar can always be grabbed again. */
const KEEP_VISIBLE = 64;
const STEP = 16;

// ---- shared layer --------------------------------------------------------------------------
// Every window renders into one fixed layer: above the shell and call dock (z-40), below popovers,
// menus, modals and toasts (z-50+), so a picker or confirmation opened from a window shows on top.
let layer: HTMLElement | null = null;
let zCounter = 1;

function windowLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.dataset.windowLayer = "";
  Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "45", pointerEvents: "none" });
  document.body.appendChild(layer);
  return layer;
}

// ---- phone layout: windows become full-screen sheets -----------------------------------------
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

// ---- remembered positions ----------------------------------------------------------------------
type Point = { x: number; y: number };

function readPosition(id: string): Point | null {
  try {
    const v = JSON.parse(localStorage.getItem(`diskarte:window:${id}`) ?? "null") as Point | null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}

function savePosition(id: string, p: Point) {
  try {
    localStorage.setItem(`diskarte:window:${id}`, JSON.stringify(p));
  } catch {
    // Storage blocked: the window simply opens centred next time.
  }
}

function clampPoint(p: Point, size: { width: number; height: number }): Point {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.round(Math.min(Math.max(p.x, KEEP_VISIBLE - size.width), vw - KEEP_VISIBLE)),
    y: Math.round(Math.min(Math.max(p.y, 0), vh - 48)),
  };
}

export interface FloatingWindowProps {
  open: boolean;
  onClose: () => void;
  /** Title bar text and the window's accessible name. */
  title: string;
  /** Identifies the window; with `remember`, where the user left it is kept per browser. */
  id: string;
  /** Reopen where the user last dragged it (default). Off for per-person windows like profiles. */
  remember?: boolean;
  icon?: ReactNode;
  /** Open next to this element (e.g. the member row) instead of centred. */
  anchor?: RefObject<HTMLElement | null>;
  /** Width/height classes for the window frame (desktop); the body scrolls when content overflows. */
  className?: string;
  bodyClassName?: string;
  /** Extra controls in the title bar, before the close button. */
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}

/**
 * A non-modal, draggable, focusable window: drag it by the title bar (or focus its Move button and use
 * the arrow keys), click to bring it to the front, Escape (while focus is inside) to close. It
 * renders through a portal, so it never unmounts what opened it — opening Settings or the audio
 * mixer leaves the app shell and any active call untouched. On phones it is a full-screen sheet.
 */
export function FloatingWindow(props: FloatingWindowProps) {
  // Portals need the DOM; the window only ever opens after a user action, so render nothing on the server.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(<AnimatePresence>{props.open && <WindowFrame {...props} />}</AnimatePresence>, windowLayer());
}

function WindowFrame({ onClose, title, id, remember = true, icon, anchor, className, bodyClassName, actions, children, testId }: FloatingWindowProps) {
  const titleId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const [z, setZ] = useState(() => ++zCounter);
  const [pos, setPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const token = useRef<symbol | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const requestClose = useEffectEvent(() => onClose());

  const raise = useCallback((e: { target: EventTarget }) => {
    // React events bubble through portals: a modal opened from this window is not "inside" it.
    if (!frame.current?.contains(e.target as Node)) return;
    if (token.current) raiseOverlay(token.current);
    setZ((current) => (current === zCounter ? current : ++zCounter));
  }, []);

  // Initial placement: remembered spot, beside the anchor, or centred — always kept on screen.
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || phone) return;
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let next = remember ? readPosition(id) : null;
    if (!next && anchor?.current) {
      const a = anchor.current.getBoundingClientRect();
      const placed = computeFloatingPosition({ anchor: a, floating: size, viewport: { width: vw, height: vh }, side: "left", offset: 12 });
      next = { x: placed.left, y: placed.top };
    }
    next ??= { x: (vw - size.width) / 2, y: Math.max(16, (vh - size.height) / 3) };
    setPos(clampPoint(next, size));
    // Placement happens once per opening; later moves come from the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  // Focus: first [data-autofocus] or focusable element on open; restore focus on close.
  useEffect(() => {
    token.current = pushOverlay();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frameId = requestAnimationFrame(() => {
      const el = frame.current;
      const body = el?.querySelector("[data-window-body]");
      (el?.querySelector<HTMLElement>("[data-autofocus]") ?? body?.querySelector<HTMLElement>(FOCUSABLE) ?? el?.querySelector<HTMLElement>("[data-window-close]"))?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !token.current || !isTopOverlay(token.current)) return;
      if (!frame.current?.contains(document.activeElement)) return;
      e.stopPropagation();
      requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("keydown", onKey);
      if (token.current) removeOverlay(token.current);
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.();
    };
  }, []);

  // Keep the window reachable when the viewport shrinks.
  useEffect(() => {
    if (phone) return;
    const onResize = () => {
      const el = frame.current;
      if (el) setPos((p) => (p ? clampPoint(p, { width: el.offsetWidth, height: el.offsetHeight }) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phone]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (phone || e.button !== 0 || !pos || (target.closest("button,a,input,select,textarea") && !target.closest("[data-move]"))) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = frame.current;
    if (!d || !el) return;
    setPos(clampPoint({ x: e.clientX - d.dx, y: e.clientY - d.dy }, { width: el.offsetWidth, height: el.offsetHeight }));
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (pos && remember) savePosition(id, pos);
  }

  function onMoveKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const el = frame.current;
    if (!delta || !pos || !el) return;
    e.preventDefault();
    const step = e.shiftKey ? STEP * 4 : STEP;
    const next = clampPoint({ x: pos.x + delta[0] * step, y: pos.y + delta[1] * step }, { width: el.offsetWidth, height: el.offsetHeight });
    setPos(next);
    if (remember) savePosition(id, next);
  }

  return (
    <motion.div
      ref={frame}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-window={id}
      data-testid={testId}
      onPointerDownCapture={raise}
      onFocusCapture={raise}
      style={phone ? { zIndex: z, pointerEvents: "auto" } : { zIndex: z, pointerEvents: "auto", left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? undefined : "hidden" }}
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: 4, pointerEvents: "none" }}
      transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "fixed flex flex-col overflow-hidden border border-white/10 bg-slate-900/80 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl",
        phone ? "pt-safe inset-0 rounded-none" : cn("max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] rounded-2xl", className),
        dragging && "select-none",
      )}
    >
      <div
        className={cn(
          "flex h-11 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.04] pl-3 pr-1.5 pointer-coarse:h-12",
          !phone && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-window-handle=""
      >
        {!phone && (
          <button
            type="button"
            data-move=""
            aria-label="Move window"
            title="Drag to move, or use the arrow keys"
            onKeyDown={onMoveKey}
            className="flex size-7 shrink-0 cursor-[inherit] items-center justify-center rounded-md text-slate-500 hover:text-slate-200"
          >
            <GripHorizontal className="size-4" aria-hidden />
          </button>
        )}
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
  );
}
