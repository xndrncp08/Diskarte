"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * Pulse shell state the pages' seams share: the Context sheet (open as a sheet, or pinned beside the canvas on
 * wide screens) and the navigator slot the active Space's rooms portal into.
 */
interface PulseUIValue {
  /** The sheet is open (narrow screens, or not pinned). */
  contextOpen: boolean;
  setContextOpen: (open: boolean) => void;
  /** Pinned open beside the canvas; only takes effect at ≥ 1200 px (`docked`). */
  contextPinned: boolean;
  setContextPinned: (pinned: boolean) => void;
  /** Pinned and wide enough: the Context panel is a column, not a sheet. */
  docked: boolean;
  wide: boolean;
  /** Where the active Space's rooms render inside the navigator (null while the Spaces view is hidden). */
  roomsSlot: HTMLElement | null;
  setRoomsSlot: (el: HTMLElement | null) => void;
}

const PulseUIContext = createContext<PulseUIValue | null>(null);

// Saved per browser, like Classic's member-list toggle (diskarte:layout:v2 → membersOpen).
const PINNED_KEY = "diskarte:pulse:context-pinned";
const listeners = new Set<() => void>();
const readPinned = () => {
  try { return localStorage.getItem(PINNED_KEY) === "1"; } catch { return false; }
};
function writePinned(pinned: boolean) {
  try { localStorage.setItem(PINNED_KEY, pinned ? "1" : "0"); } catch { /* private mode: this page only */ }
  listeners.forEach((l) => l());
}
const subscribePinned = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

const WIDE = "(min-width: 75rem)"; // the pulse-sheet breakpoint
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia?.(WIDE);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}

export function PulseUIProvider({ children }: { children: ReactNode }) {
  const [contextOpen, setContextOpen] = useState(false);
  const [roomsSlot, setRoomsSlot] = useState<HTMLElement | null>(null);
  const contextPinned = useSyncExternalStore(subscribePinned, readPinned, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia?.(WIDE).matches ?? false, () => false);
  const value = useMemo<PulseUIValue>(
    () => ({ contextOpen, setContextOpen, contextPinned, setContextPinned: writePinned, docked: contextPinned && wide, wide, roomsSlot, setRoomsSlot }),
    [contextOpen, contextPinned, wide, roomsSlot],
  );
  return <PulseUIContext.Provider value={value}>{children}</PulseUIContext.Provider>;
}

const NOOP: PulseUIValue = { contextOpen: false, setContextOpen: () => {}, contextPinned: false, setContextPinned: () => {}, docked: false, wide: false, roomsSlot: null, setRoomsSlot: () => {} };

/** The Pulse shell's state; a closed, inert default outside it (isolated renders). */
export function usePulseUI(): PulseUIValue {
  return useContext(PulseUIContext) ?? NOOP;
}
