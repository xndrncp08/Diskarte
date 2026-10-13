"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * The app's column layout (Discord-style): rail · channels · main · members. The channel and member
 * columns are resizable and the member list toggles; widths and the toggle are saved per browser.
 */
export interface LayoutState {
  /** Channel column width in px. */
  nav: number;
  /** Member column width in px. */
  roster: number;
  membersOpen: boolean;
}

export const NAV_WIDTH = { min: 200, max: 420, initial: 240 };
export const ROSTER_WIDTH = { min: 200, max: 400, initial: 248 };
const STORAGE_KEY = "diskarte:layout:v2";
const DEFAULT: LayoutState = { nav: NAV_WIDTH.initial, roster: ROSTER_WIDTH.initial, membersOpen: true };

const clamp = (v: number, { min, max }: { min: number; max: number }) => Math.round(Math.min(max, Math.max(min, v)));

/** Saved layout, or the default; anything malformed falls back field by field. */
export function parseLayout(raw: string | null): LayoutState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<LayoutState>) : {};
    return {
      nav: typeof v.nav === "number" ? clamp(v.nav, NAV_WIDTH) : DEFAULT.nav,
      roster: typeof v.roster === "number" ? clamp(v.roster, ROSTER_WIDTH) : DEFAULT.roster,
      membersOpen: typeof v.membersOpen === "boolean" ? v.membersOpen : DEFAULT.membersOpen,
    };
  } catch {
    return DEFAULT;
  }
}

export interface LayoutStore {
  get: () => LayoutState;
  subscribe: (listener: () => void) => () => void;
  set: (patch: Partial<LayoutState>) => void;
}

function createLayoutStore(): LayoutStore {
  let state: LayoutState | null = null;
  const listeners = new Set<() => void>();
  const read = () => {
    if (state) return state;
    try {
      state = parseLayout(localStorage.getItem(STORAGE_KEY));
    } catch {
      state = DEFAULT;
    }
    return state;
  };
  return {
    get: read,
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    set: (patch) => {
      const next = { ...read(), ...patch };
      state = { nav: clamp(next.nav, NAV_WIDTH), roster: clamp(next.roster, ROSTER_WIDTH), membersOpen: next.membersOpen };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Private mode: this session only.
      }
      listeners.forEach((l) => l());
    },
  };
}

const LayoutContext = createContext<LayoutStore | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createLayoutStore);
  return <LayoutContext.Provider value={store}>{children}</LayoutContext.Provider>;
}

/** The layout and its setter; outside the app shell (isolated renders) a fixed default. */
export function useLayout(): [LayoutState, (patch: Partial<LayoutState>) => void] {
  const store = useContext(LayoutContext);
  const state = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.get ?? getDefault, getDefault);
  return [state, store?.set ?? ignore];
}

const noSubscribe = () => () => undefined;
const getDefault = () => DEFAULT;
const ignore = () => undefined;

// ---- desktop vs phone ------------------------------------------------------------------------
// Columns from tablet width up; phones keep the stacked layout with the slide-in drawer.

const DESKTOP_QUERY = "(min-width: 768px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia?.(DESKTOP_QUERY);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}

export function useIsCanvas(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia?.(DESKTOP_QUERY).matches ?? false, () => false);
}
