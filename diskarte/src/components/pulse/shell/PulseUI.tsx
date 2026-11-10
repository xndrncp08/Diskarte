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
  /** The Context tab showing (people, pinned, about). */
  contextTab: string;
  setContextTab: (tab: string) => void;
  /** Shows Context on a tab: the docked column if pinned and wide, else the sheet (the masthead's pin button uses "pinned"). */
  openContext: (tab: string) => void;
  /** Where the active Space's rooms render inside the navigator (null while the Spaces view is hidden). */
  roomsSlot: HTMLElement | null;
  setRoomsSlot: (el: HTMLElement | null) => void;
  /** The open Space row's action area (its "…" menu and Invite), filled by the same portal owner as the rooms. */
  spaceActionsSlot: HTMLElement | null;
  setSpaceActionsSlot: (el: HTMLElement | null) => void;
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
  const [contextTab, setContextTab] = useState("people");
  const [roomsSlot, setRoomsSlot] = useState<HTMLElement | null>(null);
  const [spaceActionsSlot, setSpaceActionsSlot] = useState<HTMLElement | null>(null);
  const contextPinned = useSyncExternalStore(subscribePinned, readPinned, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia?.(WIDE).matches ?? false, () => false);
  const docked = contextPinned && wide;
  const value = useMemo<PulseUIValue>(
    () => ({
      contextOpen, setContextOpen, contextPinned, setContextPinned: writePinned, docked, wide, contextTab, setContextTab, roomsSlot, setRoomsSlot, spaceActionsSlot, setSpaceActionsSlot,
      openContext: (tab: string) => { setContextTab(tab); if (!docked) setContextOpen(true); },
    }),
    [contextOpen, contextPinned, docked, wide, contextTab, roomsSlot, spaceActionsSlot],
  );
  return <PulseUIContext.Provider value={value}>{children}</PulseUIContext.Provider>;
}

const noop = () => {};
const NOOP: PulseUIValue = { contextOpen: false, setContextOpen: noop, contextPinned: false, setContextPinned: noop, docked: false, wide: false, contextTab: "people", setContextTab: noop, openContext: noop, roomsSlot: null, setRoomsSlot: noop, spaceActionsSlot: null, setSpaceActionsSlot: noop };

/** The Pulse shell's state; a closed, inert default outside it (isolated renders). */
export function usePulseUI(): PulseUIValue {
  return useContext(PulseUIContext) ?? NOOP;
}
