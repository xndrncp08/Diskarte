"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useWorkspaceStore } from "@/components/workspace/WorkspaceProvider";
import { coupledResize, findSeams, PANEL_IDS, resizeFrom, snapResize, type Edge, type PanelId, type Rect, type Rects } from "@/lib/workspace";

interface Gesture {
  id: PanelId;
  edge: Edge;
  start: Rects;
  pointer: { x: number; y: number };
  latest: { x: number; y: number; detach: boolean };
  next: Rects;
  frame: number | null;
  pointerId: number;
}

const same = (a?: Rect, b?: Rect) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The panels whose rectangle differs from where they started. */
function changedRects(start: Rects, next: Rects): Rects {
  const out: Rects = {};
  for (const id of PANEL_IDS) if (next[id] && !same(next[id], start[id])) out[id] = next[id];
  return out;
}

/** Writes a panel's geometry straight to its CSS variables: no React render while dragging. */
function paintPanel(id: PanelId, r: Rect) {
  const el = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
  if (!el) return;
  el.style.setProperty("--px", `${r.x}px`);
  el.style.setProperty("--py", `${r.y}px`);
  el.style.setProperty("--pw", `${r.w}px`);
  el.style.setProperty("--ph", `${r.h}px`);
}

/** Keeps seam handles on their joints while panels move under them. */
function paintSeams(rects: Rects) {
  for (const seam of findSeams(rects)) {
    const el = document.querySelector<HTMLElement>(`[data-seam="${seam.a}:${seam.b}"]`);
    if (!el) continue;
    Object.assign(el.style, { left: `${seam.rect.x}px`, top: `${seam.rect.y}px`, width: `${seam.rect.w}px`, height: `${seam.rect.h}px` });
  }
}

function markCoupled(ids: Iterable<PanelId>) {
  const set = new Set(ids);
  for (const id of PANEL_IDS) document.querySelector(`[data-panel="${id}"]`)?.toggleAttribute("data-coupled", set.has(id));
}

/**
 * Resizing panels on the workspace canvas, coupled by default: panels docked to the edge being
 * dragged move with it (see `coupledResize`), so tiled layouts never overlap or open gaps. Holding
 * Alt / Option detaches — only the grabbed panel resizes (with magnetic snapping), like before.
 *
 * Pointer moves are coalesced to one paint per animation frame and only touch CSS variables; the
 * store (and so React) hears about it once, on release — chat inputs, scroll positions and video
 * elements inside the panels just reflow.
 */
export function useCoupledResize() {
  const store = useWorkspaceStore();
  const gesture = useRef<Gesture | null>(null);

  function solve(g: Gesture): Rects {
    const bounds = store.getBounds();
    if (!bounds) return g.start;
    const dx = g.latest.x - g.pointer.x;
    const dy = g.latest.y - g.pointer.y;
    if (g.latest.detach) {
      const others = PANEL_IDS.filter((p) => p !== g.id && g.start[p]).map((p) => g.start[p]!);
      return { ...g.start, [g.id]: snapResize(resizeFrom(g.start[g.id]!, g.edge, dx, dy), g.edge, others, bounds) };
    }
    return coupledResize(g.start, g.id, g.edge, dx, dy, bounds);
  }

  function apply() {
    const g = gesture.current;
    if (!g) return;
    g.frame = null;
    g.next = solve(g);
    const moved = Object.keys(changedRects(g.start, g.next)) as PanelId[];
    for (const id of moved) paintPanel(id, g.next[id]!);
    // Panels the drag didn't (or no longer) touch go back to where they started.
    for (const id of PANEL_IDS) if (g.start[id] && !moved.includes(id)) paintPanel(id, g.start[id]!);
    paintSeams(g.next);
    markCoupled(g.latest.detach ? [] : moved);
  }

  function schedule() {
    const g = gesture.current;
    if (g && g.frame === null) g.frame = requestAnimationFrame(apply);
  }

  // Alt pressed or released mid-drag takes effect right away, without waiting for the pointer to move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gesture.current;
      if (!g || e.key !== "Alt" || g.latest.detach === e.altKey) return;
      g.latest = { ...g.latest, detach: e.altKey };
      schedule();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  function begin(id: PanelId, edge: Edge, e: ReactPointerEvent<HTMLElement>) {
    const start = store.visibleRects();
    if (!start[id] || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    store.raise(id);
    const latest = { x: e.clientX, y: e.clientY, detach: e.altKey };
    gesture.current = { id, edge, start, pointer: { x: e.clientX, y: e.clientY }, latest, next: start, frame: null, pointerId: e.pointerId };
    document.querySelector("[data-workspace]")?.setAttribute("data-resizing", "");
  }

  function move(e: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    g.latest = { x: e.clientX, y: e.clientY, detach: e.altKey };
    schedule();
  }

  function end() {
    const g = gesture.current;
    if (!g) return;
    if (g.frame !== null) cancelAnimationFrame(g.frame);
    apply(); // the final position, even if the last frame hadn't painted yet
    gesture.current = null;
    markCoupled([]);
    document.querySelector("[data-workspace]")?.removeAttribute("data-resizing");
    const changed = changedRects(g.start, g.next);
    if (Object.keys(changed).length) store.commitRects(changed);
  }

  /** Keyboard resizing (Resize buttons, seams): one step, coupled unless `detach`. */
  function nudge(id: PanelId, edge: Edge, dx: number, dy: number, detach = false) {
    const start = store.visibleRects();
    const bounds = store.getBounds();
    if (!start[id] || !bounds) return;
    const next = detach
      ? { [id]: snapResize(resizeFrom(start[id], edge, dx, dy), edge, [], bounds) }
      : coupledResize(start, id, edge, dx, dy, bounds);
    const changed = changedRects(start, next);
    if (Object.keys(changed).length) store.commitRects(changed);
  }

  return { begin, move, end, nudge };
}
