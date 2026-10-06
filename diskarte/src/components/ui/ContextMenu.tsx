"use client";

import { AnimatePresence } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { FloatingPortal } from "./floating";
import { InertWhenExiting } from "./InertWhenExiting";
import { MenuItems, useMenuDismiss, useMenuKeyboard, type MenuItem } from "./Menu";

export interface Point {
  x: number;
  y: number;
}

/**
 * Places a context menu at the pointer: below-right of it by default, flipped left / up when it
 * would overflow the viewport there, then clamped inside the viewport (minus padding).
 */
export function computeContextMenuPosition({
  point,
  floating,
  viewport,
  padding = 8,
}: {
  point: Point;
  floating: { width: number; height: number };
  viewport: { width: number; height: number };
  padding?: number;
}): { top: number; left: number } {
  let left = point.x;
  let top = point.y;
  if (left + floating.width > viewport.width - padding) left = point.x - floating.width;
  if (top + floating.height > viewport.height - padding) top = point.y - floating.height;
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(value, padding), Math.max(padding, max)));
  return { top: clamp(top, viewport.height - floating.height - padding), left: clamp(left, viewport.width - floating.width - padding) };
}

export const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;
const NATIVE_TARGETS = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

/** One context menu open at a time, app-wide: opening another dismisses this one. */
let dismissCurrent: (() => void) | null = null;
/** Nested targets (an author's avatar inside a message): the innermost one handles the gesture. */
const handled = new WeakSet<Event>();

/** React events bubble through portals: ignore ones from an open menu panel rendered inside the target. */
function outside(e: { currentTarget: HTMLElement; target: EventTarget }) {
  return !e.currentTarget.contains(e.target as Node);
}

/** Right-click keeps the browser's own menu for text fields, selected text, and Shift+right-click. */
function wantsNativeMenu(e: { shiftKey: boolean; target: EventTarget }) {
  if (e.shiftKey) return true;
  if ((e.target as Element).closest?.(NATIVE_TARGETS)) return true;
  const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

export interface ContextMenuState {
  /** Where the menu is open (viewport coordinates), or null while closed. */
  point: Point | null;
  /** The element the menu was opened from: an anchor for windows its items open. */
  target: HTMLElement | null;
  close: (restoreFocus?: boolean) => void;
  /** Spread onto the element people right-click / long-press / Shift+F10 on. */
  triggerProps: {
    "data-context-menu": "";
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => void;
  };
}

/**
 * State and gestures for a context menu: right-click (mouse), long-press (touch) or Shift+F10 /
 * the Menu key (keyboard). Render the menu with <ContextMenu menu={…}>; its items only mount
 * while it is open, so a closed menu costs one piece of state per target.
 */
export function useContextMenu({ disabled = false }: { disabled?: boolean } = {}): ContextMenuState {
  const [open, setOpen] = useState<{ point: Point; target: HTMLElement } | null>(null);
  const [dismiss] = useState(() => () => setOpen(null));
  const target = useRef<HTMLElement | null>(null);
  const viaKeyboard = useRef(false);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const swallowClick = useRef(false);

  const clearPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  useEffect(
    () => () => {
      clearPress();
      if (dismissCurrent === dismiss) dismissCurrent = null;
    },
    [clearPress, dismiss],
  );

  const openAt = useCallback(
    (x: number, y: number, el: HTMLElement, keyboard: boolean) => {
      if (dismissCurrent && dismissCurrent !== dismiss) dismissCurrent();
      dismissCurrent = dismiss;
      target.current = el;
      viaKeyboard.current = keyboard;
      setOpen({ point: { x, y }, target: el });
    },
    [dismiss],
  );

  const close = useCallback(
    (restoreFocus = false) => {
      setOpen(null);
      if (dismissCurrent === dismiss) dismissCurrent = null;
      if (restoreFocus && viaKeyboard.current) target.current?.focus({ preventScroll: true });
    },
    [dismiss],
  );

  const triggerProps: ContextMenuState["triggerProps"] = {
    "data-context-menu": "",
    onContextMenu: (e) => {
      if (disabled || outside(e) || handled.has(e.nativeEvent) || wantsNativeMenu(e)) return;
      handled.add(e.nativeEvent);
      e.preventDefault();
      clearPress();
      const el = e.currentTarget;
      // A keyboard-raised `contextmenu` (Menu key) has no pointer position: open under the element.
      if (e.clientX === 0 && e.clientY === 0) {
        const rect = el.getBoundingClientRect();
        openAt(rect.left + 8, rect.bottom, el, true);
      } else openAt(e.clientX, e.clientY, el, false);
    },
    onKeyDown: (e) => {
      if (disabled || outside(e) || handled.has(e.nativeEvent)) return;
      if (!((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu")) return;
      if ((e.target as Element).closest(NATIVE_TARGETS)) return;
      handled.add(e.nativeEvent);
      e.preventDefault();
      const focused = e.target instanceof HTMLElement && e.currentTarget.contains(e.target) ? e.target : e.currentTarget;
      const rect = focused.getBoundingClientRect();
      openAt(rect.left + 8, rect.bottom, focused, true);
    },
    onPointerDown: (e) => {
      if (outside(e)) return;
      swallowClick.current = false;
      if (disabled || e.pointerType !== "touch" || handled.has(e.nativeEvent)) return;
      handled.add(e.nativeEvent);
      clearPress();
      const { clientX: x, clientY: y } = e;
      const el = e.currentTarget;
      press.current = {
        x,
        y,
        timer: setTimeout(() => {
          press.current = null;
          // The finger lifting after a long-press must not also "tap" the row underneath.
          swallowClick.current = true;
          navigator.vibrate?.(10);
          openAt(x, y, el, false);
        }, LONG_PRESS_MS),
      };
    },
    onPointerMove: (e) => {
      if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > LONG_PRESS_SLOP) clearPress();
    },
    onPointerUp: clearPress,
    onPointerCancel: clearPress,
    onClickCapture: (e) => {
      if (!swallowClick.current || outside(e)) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { point: open?.point ?? null, target: open?.target ?? null, close, triggerProps };
}

const PickContext = createContext<() => void>(() => undefined);

/**
 * The menu panel, portalled to <body> at the pointer. `children` (usually <ContextMenuItems>, or a
 * component that builds items with hooks) only mount while the menu is open.
 */
export function ContextMenu({ menu, label, children }: { menu: ContextMenuState; label: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const { point, close } = menu;
  const open = point !== null;
  // Lists render one of these per row (every chat message): skip the portal until first opened.
  const [used, setUsed] = useState(false);
  if (open && !used) setUsed(true);

  // Measure, then nudge inside the viewport before paint. Written straight to the node: framer-motion
  // owns transform/opacity, and a state round-trip would paint one frame at the raw pointer.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!point || !el) return;
    const { top, left } = computeContextMenuPosition({
      point,
      floating: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }, [point]);

  const onScrollOrResize = useEffectEvent((e: Event) => {
    if (e.type === "scroll" && panel.current?.contains(e.target as Node)) return;
    close(false);
  });
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("blur", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("blur", onScrollOrResize);
    };
  }, [open]);

  useMenuDismiss(open, [panel], () => close(false));
  useMenuKeyboard(open, panel, () => close(true), () => close(false));

  if (!used) return null;
  return (
    <FloatingPortal>
      <AnimatePresence>
        {point && (
          <InertWhenExiting
            ref={panel}
            role="menu"
            aria-label={label}
            data-floating="context-menu"
            style={{ position: "fixed", top: point.y, left: point.x }}
            onContextMenu={(e) => e.preventDefault()}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.1 }}
            className="glass-strong scrollbar-thin z-[70] max-h-[calc(100dvh-1rem)] min-w-52 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl bg-slate-950! p-1.5 shadow-xl shadow-black/50"
          >
            <PickContext.Provider value={() => close(true)}>{children}</PickContext.Provider>
          </InertWhenExiting>
        )}
      </AnimatePresence>
    </FloatingPortal>
  );
}

/** Closes the surrounding context menu (for custom rows such as quick reactions). */
export function useContextMenuPick() {
  return useContext(PickContext);
}

/** The standard rows of a context menu; picking one closes the menu, then runs the item. */
export function ContextMenuItems({ items }: { items: MenuItem[] }) {
  const pick = useContextMenuPick();
  return <MenuItems items={items} onPick={pick} />;
}

/** Copies text for a menu item and confirms with a toast. */
export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied.`);
  } catch {
    toast.error(`Couldn't copy the ${what.toLowerCase()}.`);
  }
}
