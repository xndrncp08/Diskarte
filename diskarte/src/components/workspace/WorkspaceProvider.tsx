"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import {
  applyPreset,
  defaultWorkspace,
  newestWorkspace,
  parseWorkspace,
  PANEL_IDS,
  raisePanel,
  reflowPanels,
  toFraction,
  visibleRectsOf,
  type PanelId,
  type PanelState,
  type Preset,
  type Rect,
  type Rects,
  type RosterMode,
  type WorkspaceState,
} from "@/lib/workspace";

const STORAGE_KEY = "diskarte:workspace:v1";
/** Account sync is debounced: a burst of drags becomes one metadata write. */
const REMOTE_DEBOUNCE_MS = 2500;
/** The nominal canvas the default layout's fractions are computed on before the real one is measured. */
const NOMINAL: Rect = { x: 0, y: 0, w: 1360, h: 820 };

type Listener = () => void;

export interface WorkspaceStore {
  getState: () => WorkspaceState;
  subscribe: (l: Listener) => () => void;
  /** Pixel rectangle panels live in (canvas minus the tray and a docked roster). */
  getBounds: () => Rect | null;
  setBounds: (b: Rect) => void;
  subscribeBounds: (l: Listener) => () => void;
  /** Which panels (and the roster drawer, as "roster") are mounted right now: only those get tray pills. */
  getMounted: () => ReadonlyMap<string, string>;
  mount: (id: PanelId | "roster", title?: string) => () => void;
  subscribeMounted: (l: Listener) => () => void;

  commitRect: (id: PanelId, px: Rect) => void;
  /** Several panels at once (a coupled resize): one change, one save. */
  commitRects: (px: Rects) => void;
  /** Pixel rectangles of the panels currently on the canvas (mounted, not minimized or closed). */
  visibleRects: () => Rects;
  raise: (id: PanelId) => void;
  setMinimized: (id: PanelId, minimized: boolean) => void;
  setClosed: (id: PanelId, closed: boolean) => void;
  setRoster: (mode: RosterMode) => void;
  applyPreset: (preset: Preset, opts: { voiceAvailable: boolean }) => void;
  reset: () => void;
  /** Replace the whole state (hydration from storage). */
  load: (state: WorkspaceState) => void;
}

/** Keeps z values small and in the same order (they're persisted). */
function normaliseZ(state: WorkspaceState): WorkspaceState {
  const order = [...PANEL_IDS].sort((a, b) => state.panels[a].z - state.panels[b].z);
  if (order.every((id, i) => state.panels[id].z === i + 1)) return state;
  const panels = { ...state.panels };
  order.forEach((id, i) => (panels[id] = { ...panels[id], z: i + 1 }));
  return { ...state, panels };
}

export function createWorkspaceStore(initial: WorkspaceState, onChange?: (s: WorkspaceState) => void): WorkspaceStore {
  let state = initial;
  let bounds: Rect | null = null;
  let mounted: ReadonlyMap<string, string> = new Map();
  const listeners = new Set<Listener>();
  const boundsListeners = new Set<Listener>();
  const mountedListeners = new Set<Listener>();

  const set = (next: WorkspaceState, persist = true) => {
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
    if (persist) onChange?.(normaliseZ(state));
  };
  const patchPanel = (id: PanelId, patch: Partial<PanelState>, opts: { clearPreset?: boolean } = {}) =>
    set({ ...state, t: Date.now(), preset: opts.clearPreset ? null : state.preset, panels: { ...state.panels, [id]: { ...state.panels[id], ...patch } } });

  return {
    getState: () => state,
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
    getBounds: () => bounds,
    setBounds: (b) => {
      if (bounds && bounds.x === b.x && bounds.y === b.y && bounds.w === b.w && bounds.h === b.h) return;
      const previous = bounds;
      bounds = b;
      // Until the user arranges anything (t = 0), the default layout is laid out for the real canvas;
      // after that, panels reflow like windows (see reflowPanels). Neither is a user change to save.
      if (state.t === 0) set({ ...defaultWorkspace(b), roster: state.roster }, false);
      else if (previous) set(reflowPanels(state, previous, b), false);
      boundsListeners.forEach((l) => l());
    },
    subscribeBounds: (l) => (boundsListeners.add(l), () => void boundsListeners.delete(l)),
    getMounted: () => mounted,
    mount: (id, title = id) => {
      mounted = new Map(mounted).set(id, title);
      mountedListeners.forEach((l) => l());
      return () => {
        const next = new Map(mounted);
        next.delete(id);
        mounted = next;
        mountedListeners.forEach((l) => l());
      };
    },
    subscribeMounted: (l) => (mountedListeners.add(l), () => void mountedListeners.delete(l)),

    commitRect: (id, px) => {
      if (!bounds) return;
      // Moving or resizing by hand turns the active preset into a custom layout.
      patchPanel(id, { rect: toFraction(px, bounds) }, { clearPreset: true });
    },
    commitRects: (px) => {
      if (!bounds) return;
      const b = bounds;
      const panels = { ...state.panels };
      for (const id of PANEL_IDS) {
        const r = px[id];
        if (r) panels[id] = { ...panels[id], rect: toFraction(r, b) };
      }
      set({ ...state, panels, preset: null, t: Date.now() });
    },
    visibleRects: () => (bounds ? visibleRectsOf(state.panels, bounds, mounted) : {}),
    raise: (id) => set(raisePanel(state, id), false),
    setMinimized: (id, minimized) => {
      const current = state.panels[id];
      if (current.minimized === minimized && !current.closed) return;
      // Restoring a panel also brings it to the front.
      const base = minimized ? state : raisePanel(state, id);
      set({ ...base, t: Date.now(), preset: null, panels: { ...base.panels, [id]: { ...base.panels[id], minimized, closed: false } } });
    },
    setClosed: (id, closed) => patchPanel(id, { closed, minimized: false }),
    setRoster: (roster) => roster !== state.roster && set({ ...state, roster, t: Date.now() }),
    applyPreset: (preset, opts) => set(applyPreset(state, preset, bounds ?? NOMINAL, opts)),
    reset: () => set({ ...defaultWorkspace(bounds ?? NOMINAL), t: Date.now() }),
    load: (next) => set(next, false),
  };
}

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

function readLocal(): WorkspaceState | null {
  try {
    return parseWorkspace(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Owns the floating canvas layout: panel rectangles, z-order, minimized/closed panels, the roster
 * drawer and the active preset. Saved to this browser right away and to the account (Supabase user
 * metadata) shortly after, so the arrangement follows you to other devices; on load the newer copy wins.
 */
export function WorkspaceProvider({ remote, children }: { remote?: unknown; children: ReactNode }) {
  const supabase = useOptionalSupabase();
  const [store] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return createWorkspaceStore(parseWorkspace(remote) ?? defaultWorkspace(NOMINAL), (s) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        // Storage blocked: the account copy still saves it.
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          void Promise.resolve(supabase?.auth.updateUser({ data: { workspace: s } })).catch(() => undefined);
        } catch {
          // Offline or signed out: this browser's copy still has it.
        }
      }, REMOTE_DEBOUNCE_MS);
    });
  });

  // This browser's copy may be newer than the account's (or the only one): adopt it after hydration.
  useEffect(() => {
    const best = newestWorkspace(readLocal(), parseWorkspace(remote));
    if (best && best !== store.getState()) store.load(best);
    // Hydrate once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <WorkspaceContext.Provider value={store}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceStore(): WorkspaceStore {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error("useWorkspaceStore must be used inside <WorkspaceProvider>");
  return store;
}

export function useOptionalWorkspaceStore(): WorkspaceStore | null {
  return useContext(WorkspaceContext);
}

/** Subscribes to one slice; components re-render only when that slice changes. */
export function useWorkspace<T>(select: (s: WorkspaceState) => T): T {
  const store = useWorkspaceStore();
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getState()),
    () => select(store.getState()),
  );
}

export function useWorkspaceBounds(): Rect | null {
  const store = useWorkspaceStore();
  return useSyncExternalStore(store.subscribeBounds, store.getBounds, () => null);
}

export function useMountedPanels(): ReadonlyMap<string, string> {
  const store = useWorkspaceStore();
  return useSyncExternalStore(store.subscribeMounted, store.getMounted, store.getMounted);
}

// ---- canvas mode -------------------------------------------------------------------------------
// The floating canvas runs from tablet width up; phones keep the stacked layout with drawers.

const CANVAS_QUERY = "(min-width: 768px)";
function subscribeCanvas(cb: () => void) {
  const mq = window.matchMedia?.(CANVAS_QUERY);
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}

export function useIsCanvas(): boolean {
  return useSyncExternalStore(subscribeCanvas, () => window.matchMedia?.(CANVAS_QUERY).matches ?? false, () => false);
}

// Whether a workspace canvas is on screen at all (/settings pages have none): the picture-in-picture
// call view, which lives above the shell, defers to the canvas's own voice panel.
let canvasActive = false;
const canvasListeners = new Set<Listener>();
export function setCanvasActive(active: boolean) {
  canvasActive = active;
  canvasListeners.forEach((l) => l());
}
export function useCanvasActive(): boolean {
  return useSyncExternalStore(
    (l) => (canvasListeners.add(l), () => void canvasListeners.delete(l)),
    () => canvasActive,
    () => false,
  );
}
