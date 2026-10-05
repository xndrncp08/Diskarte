import { z } from "zod";

/**
 * Pure geometry and state for the floating workspace canvas: panel rectangles, magnetic snapping,
 * presets and the persisted layout. Rectangles are pixels relative to the canvas; the saved layout
 * stores fractions of the canvas so an arrangement survives window resizes and other screens.
 */

export const PANEL_IDS = ["nav", "main", "voice"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = { nav: "Navigator", main: "Chat", voice: "Voice" };

export const MIN_W = 320;
export const MIN_H = 240;
/** Magnetic pull distance for edges, and the grid free moves settle on. */
export const SNAP = 8;
export const GRID = 8;
/** Breathing room between tiled panels and around the canvas. */
export const GAP = 12;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelState {
  /** Fractions (0–1) of the canvas. */
  rect: Rect;
  z: number;
  minimized: boolean;
  /** Closed panels stay hidden until something (a preset, a new call) opens them again. */
  closed: boolean;
}

export type Preset = "focus" | "multitask" | "minimal";
export type RosterMode = "closed" | "open" | "docked";

export interface WorkspaceState {
  panels: Record<PanelId, PanelState>;
  roster: RosterMode;
  preset: Preset | null;
  /** When it was last changed (ms): the newer of this browser's copy and the account's copy wins. */
  t: number;
}

export type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const round = (n: number) => Math.round(n * 10000) / 10000;

export function toFraction(r: Rect, bounds: Rect): Rect {
  return { x: round((r.x - bounds.x) / bounds.w), y: round((r.y - bounds.y) / bounds.h), w: round(r.w / bounds.w), h: round(r.h / bounds.h) };
}

export function fromFraction(f: Rect, bounds: Rect): Rect {
  return clampRect({ x: bounds.x + f.x * bounds.w, y: bounds.y + f.y * bounds.h, w: f.w * bounds.w, h: f.h * bounds.h }, bounds);
}

/** Minimum size a panel can have inside `bounds` (never more than the bounds themselves). */
function minSize(bounds: Rect) {
  return { w: Math.min(MIN_W, bounds.w), h: Math.min(MIN_H, bounds.h) };
}

/** Enforces the minimum size and keeps the whole panel inside the canvas. */
export function clampRect(r: Rect, bounds: Rect): Rect {
  const min = minSize(bounds);
  const w = Math.min(Math.max(r.w, min.w), bounds.w);
  const h = Math.min(Math.max(r.h, min.h), bounds.h);
  const x = Math.min(Math.max(r.x, bounds.x), bounds.x + bounds.w - w);
  const y = Math.min(Math.max(r.y, bounds.y), bounds.y + bounds.h - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Snap targets for a panel's leading and trailing edge on one axis: the canvas edges, every other
 * panel's matching edges (alignment), and — for panels beside it on the other axis — just past their
 * far edge with a tidy gap (docking).
 */
function targets(axis: "x" | "y", r: Rect, others: Rect[], bounds: Rect) {
  const size = axis === "x" ? "w" : "h";
  const lead = [bounds[axis]];
  const trail = [bounds[axis] + bounds[size]];
  for (const o of others) {
    lead.push(o[axis]);
    trail.push(o[axis] + o[size]);
  }
  for (const o of neighbours(r, others, axis)) {
    lead.push(o[axis] + o[size] + GAP);
    trail.push(o[axis] - GAP);
  }
  return { lead, trail };
}

function nearest(value: number, candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d <= threshold && (best === null || d < Math.abs(best - value))) best = c;
  }
  return best;
}

/** Panels that overlap the moving one on the other axis: the only ones it can dock against. */
function neighbours(r: Rect, others: Rect[], axis: "x" | "y") {
  return others.filter((o) => (axis === "x" ? o.y < r.y + r.h && r.y < o.y + o.h : o.x < r.x + r.w && r.x < o.x + o.w));
}

export interface SnapResult {
  rect: Rect;
  /** Which axes caught an edge (the caller skips grid rounding on those). */
  snapped: { x: boolean; y: boolean };
}

/**
 * Magnetic move: within `threshold` px, an edge jumps to the canvas edge, aligns with another panel's
 * edge, or docks beside it with a tidy gap — so panels tile side by side without pixel hunting.
 */
export function snapMove(r: Rect, others: Rect[], bounds: Rect, threshold = SNAP): SnapResult {
  const out = { ...r };
  const snapped = { x: false, y: false };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "w" : "h";
    const { lead, trail } = targets(axis, r, others, bounds);
    const toLead = nearest(r[axis], lead, threshold);
    const toTrail = nearest(r[axis] + r[size], trail, threshold);
    const dLead = toLead === null ? Infinity : Math.abs(toLead - r[axis]);
    const dTrail = toTrail === null ? Infinity : Math.abs(toTrail - (r[axis] + r[size]));
    if (dLead <= dTrail && toLead !== null) {
      out[axis] = toLead;
      snapped[axis] = true;
    } else if (toTrail !== null) {
      out[axis] = toTrail - r[size];
      snapped[axis] = true;
    }
  }
  return { rect: clampRect(out, bounds), snapped };
}

/** Magnetic resize: only the edges being dragged snap; the minimum size always holds. */
export function snapResize(r: Rect, edge: Edge, others: Rect[], bounds: Rect, threshold = SNAP): Rect {
  let { x, y, w, h } = r;
  const right = x + w;
  const bottom = y + h;
  const xs = targets("x", r, others, bounds);
  const ys = targets("y", r, others, bounds);
  const min = minSize(bounds);
  if (edge.includes("w")) {
    const nx = Math.max(bounds.x, Math.min(nearest(x, xs.lead, threshold) ?? x, right - min.w));
    w = right - nx;
    x = nx;
  }
  if (edge.includes("e")) {
    const nr = Math.min(bounds.x + bounds.w, Math.max(nearest(right, xs.trail, threshold) ?? right, x + min.w));
    w = nr - x;
  }
  if (edge.includes("n")) {
    const ny = Math.max(bounds.y, Math.min(nearest(y, ys.lead, threshold) ?? y, bottom - min.h));
    h = bottom - ny;
    y = ny;
  }
  if (edge.includes("s")) {
    const nb = Math.min(bounds.y + bounds.h, Math.max(nearest(bottom, ys.trail, threshold) ?? bottom, y + min.h));
    h = nb - y;
  }
  return clampRect({ x, y, w, h }, bounds);
}

/** The rectangle after dragging one edge or corner of `start` by (dx, dy), before constraints. */
export function resizeFrom(start: Rect, edge: Edge, dx: number, dy: number): Rect {
  let { x, y, w, h } = start;
  if (edge.includes("e")) w += dx;
  if (edge.includes("s")) h += dy;
  if (edge.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (edge.includes("n")) {
    y += dy;
    h -= dy;
  }
  return { x, y, w, h };
}

/** Free (unsnapped) axes settle on the 8 px grid when a drag ends. */
export function settleOnGrid(r: Rect, snapped: { x: boolean; y: boolean }, bounds: Rect): Rect {
  const g = (v: number, origin: number) => origin + Math.round((v - origin) / GRID) * GRID;
  return clampRect({ ...r, x: snapped.x ? r.x : g(r.x, bounds.x), y: snapped.y ? r.y : g(r.y, bounds.y) }, bounds);
}

// ---- coupled (linked) resizing ---------------------------------------------------------------

export type Rects = Partial<Record<PanelId, Rect>>;
type Side = "n" | "s" | "e" | "w";

const AXIS: Record<Side, "x" | "y"> = { e: "x", w: "x", s: "y", n: "y" };
const SIZE = { x: "w", y: "h" } as const;
const MIN = { x: MIN_W, y: MIN_H };

/** Panels overlapping `r` by more than a sliver on the axis perpendicular to `axis`. */
function overlapsAcross(a: Rect, b: Rect, axis: "x" | "y") {
  const [p, s] = axis === "x" ? (["y", "h"] as const) : (["x", "w"] as const);
  return Math.min(a[p] + a[s], b[p] + b[s]) - Math.max(a[p], b[p]) > SNAP;
}

/**
 * Panels docked to one side of `id`: their facing edge sits across a seam no wider than the docking
 * gap plus the 8 px snap threshold (touching, or slightly overlapping, counts too), and they share
 * some length of that edge. These move together when the shared edge is resized.
 */
export function coupledNeighbours(rects: Rects, id: PanelId, side: Side, threshold = SNAP): PanelId[] {
  const a = rects[id];
  if (!a) return [];
  const axis = AXIS[side];
  const size = SIZE[axis];
  const trailing = side === "e" || side === "s";
  return PANEL_IDS.filter((other) => {
    const b = rects[other];
    if (other === id || !b || !overlapsAcross(a, b, axis)) return false;
    const seam = trailing ? b[axis] - (a[axis] + a[size]) : a[axis] - (b[axis] + b[size]);
    return seam >= -threshold && seam <= GAP + threshold;
  });
}

/** Mirror rectangles across the canvas on one axis, so leading-edge cases reuse the trailing logic. */
function mirror(rects: Rects, axis: "x" | "y", bounds: Rect): Rects {
  const size = SIZE[axis];
  const out: Rects = {};
  for (const id of PANEL_IDS) {
    const r = rects[id];
    if (r) out[id] = { ...r, [axis]: 2 * bounds[axis] + bounds[size] - (r[axis] + r[size]) };
  }
  return out;
}

/** How far a panel's leading edge can be pushed: compress it to its minimum, then push what's beyond it. */
function absorbable(rects: Rects, id: PanelId, axis: "x" | "y", bounds: Rect, seen: Set<PanelId>): number {
  const r = rects[id]!;
  const size = SIZE[axis];
  const next = coupledNeighbours(rects, id, axis === "x" ? "e" : "s").filter((n) => !seen.has(n));
  const beyond = next.length
    ? Math.min(...next.map((n) => absorbable(rects, n, axis, bounds, new Set([...seen, n]))))
    : bounds[axis] + bounds[size] - (r[axis] + r[size]);
  return Math.max(0, r[size] - MIN[axis]) + Math.max(0, beyond);
}

/** Moves a docked panel's leading edge by `d` (> 0 compresses then pushes; < 0 lets it grow back). */
function shove(rects: Rects, id: PanelId, d: number, axis: "x" | "y", seen: Set<PanelId>) {
  const r = rects[id]!;
  const size = SIZE[axis];
  if (d <= 0) {
    rects[id] = { ...r, [axis]: r[axis] + d, [size]: r[size] - d };
    return;
  }
  const compress = Math.min(d, Math.max(0, r[size] - MIN[axis]));
  const push = d - compress;
  // Find the next links before this panel moves, while its trailing edge still meets them.
  const next = push > 0 ? coupledNeighbours(rects, id, axis === "x" ? "e" : "s").filter((n) => !seen.has(n)) : [];
  rects[id] = { ...r, [axis]: r[axis] + d, [size]: r[size] - compress };
  for (const n of next) shove(rects, n, push, axis, new Set([...seen, n]));
}

/** One axis of a coupled resize, for a trailing edge ("e"/"s") moved by `d`. */
function resizeTrailing(rects: Rects, id: PanelId, d: number, axis: "x" | "y", bounds: Rect): Rects {
  const out = { ...rects };
  const a = out[id]!;
  const size = SIZE[axis];
  const linked = coupledNeighbours(out, id, axis === "x" ? "e" : "s");
  const seen = new Set<PanelId>([id, ...linked]);
  let delta = Math.max(d, Math.min(MIN[axis], bounds[size]) - a[size]); // the panel itself keeps its minimum
  if (delta > 0) {
    const room = linked.length
      ? Math.min(...linked.map((n) => absorbable(out, n, axis, bounds, new Set([...seen]))))
      : bounds[axis] + bounds[size] - (a[axis] + a[size]);
    delta = Math.min(delta, room); // everything downstream is at its minimum against the canvas edge
  }
  for (const n of linked) shove(out, n, delta, axis, seen);
  out[id] = { ...a, [size]: a[size] + delta };
  return out;
}

/**
 * Linked resizing: dragging an edge that other panels are docked to moves them with it. Growing a
 * panel compresses its docked neighbours (and, once they reach 320 × 240, pushes the whole docked
 * block toward the canvas edge); shrinking it lets them grow by exactly the same amount — so the
 * seams keep their width and nothing overlaps or leaves a gap. `start` is the layout when the drag
 * began and (dx, dy) the pointer's total movement since then.
 */
export function coupledResize(start: Rects, id: PanelId, edge: Edge, dx: number, dy: number, bounds: Rect): Rects {
  let rects = { ...start };
  for (const side of ["e", "w", "s", "n"] as const) {
    if (!edge.includes(side)) continue;
    const axis = AXIS[side];
    const d = axis === "x" ? dx : dy;
    if (side === "e" || side === "s") {
      rects = resizeTrailing(rects, id, d, axis, bounds);
    } else {
      // Leading edges are trailing edges in a mirrored canvas.
      rects = mirror(resizeTrailing(mirror(rects, axis, bounds), id, -d, axis, bounds), axis, bounds);
    }
  }
  return rects;
}

/** Pixel rectangles of the panels on the canvas: mounted, and neither minimized nor closed. */
export function visibleRectsOf(panels: Record<PanelId, PanelState>, bounds: Rect, mounted: { has: (id: string) => boolean }): Rects {
  const out: Rects = {};
  for (const id of PANEL_IDS) {
    const p = panels[id];
    if (mounted.has(id) && !p.minimized && !p.closed) out[id] = fromFraction(p.rect, bounds);
  }
  return out;
}

/** A draggable joint between two docked panels: dragging it resizes both at once. */
export interface Seam {
  /** The panel before the seam (left of a vertical seam, above a horizontal one). */
  a: PanelId;
  b: PanelId;
  orientation: "vertical" | "horizontal";
  /** Hit area in canvas pixels: the gap between the panels (at least 8 px wide), along their shared length. */
  rect: Rect;
}

const SEAM_MIN = 8;

export function findSeams(rects: Rects): Seam[] {
  const seams: Seam[] = [];
  for (const a of PANEL_IDS) {
    const ra = rects[a];
    if (!ra) continue;
    for (const b of coupledNeighbours(rects, a, "e")) {
      const rb = rects[b]!;
      const gap = Math.max(0, rb.x - (ra.x + ra.w));
      const w = Math.max(gap, SEAM_MIN);
      const y = Math.max(ra.y, rb.y);
      seams.push({ a, b, orientation: "vertical", rect: { x: ra.x + ra.w + (gap - w) / 2, y, w, h: Math.min(ra.y + ra.h, rb.y + rb.h) - y } });
    }
    for (const b of coupledNeighbours(rects, a, "s")) {
      const rb = rects[b]!;
      const gap = Math.max(0, rb.y - (ra.y + ra.h));
      const h = Math.max(gap, SEAM_MIN);
      const x = Math.max(ra.x, rb.x);
      seams.push({ a, b, orientation: "horizontal", rect: { x, y: ra.y + ra.h + (gap - h) / 2, w: Math.min(ra.x + ra.w, rb.x + rb.w) - x, h } });
    }
  }
  return seams;
}

/**
 * When the canvas changes size (a roster docks, the tray appears, the window resizes), panels behave
 * like windows, not percentages: they keep their pixel size and place, panels touching the right or
 * bottom edge stay attached to it (shrinking or growing with it), and everything is clamped to fit.
 * Scaling proportionally instead would let minimum sizes push tiled panels into each other.
 */
export function reflowPanels(state: WorkspaceState, from: Rect, to: Rect): WorkspaceState {
  const panels = { ...state.panels };
  for (const id of PANEL_IDS) {
    const r = fromFraction(state.panels[id].rect, from);
    const atRight = r.x + r.w >= from.x + from.w - 1;
    const atBottom = r.y + r.h >= from.y + from.h - 1;
    const next = { ...r };
    if (atRight || next.x + next.w > to.x + to.w) next.w = Math.max(to.x + to.w - next.x, Math.min(MIN_W, to.w));
    if (atBottom || next.y + next.h > to.y + to.h) next.h = Math.max(to.y + to.h - next.y, Math.min(MIN_H, to.h));
    panels[id] = { ...state.panels[id], rect: toFraction(clampRect(next, to), to) };
  }
  return { ...state, panels };
}

// ---- layouts ---------------------------------------------------------------------------------

function column(bounds: Rect, x: number, w: number): Rect {
  return { x, y: bounds.y, w, h: bounds.h };
}

/** The everyday arrangement: navigator on the left, the active view filling the rest, voice tucked right. */
export function defaultRects(bounds: Rect): Record<PanelId, Rect> {
  const navW = Math.max(MIN_W, Math.min(320, bounds.w * 0.26));
  const voiceW = Math.max(MIN_W, Math.min(400, bounds.w * 0.3));
  const voiceH = Math.max(MIN_H, Math.min(300, bounds.h * 0.42));
  return {
    nav: column(bounds, bounds.x, navW),
    main: column(bounds, bounds.x + navW + GAP, bounds.w - navW - GAP),
    voice: { x: bounds.x + bounds.w - voiceW, y: bounds.y + bounds.h - voiceH, w: voiceW, h: voiceH },
  };
}

function panel(rect: Rect, bounds: Rect, z: number, minimized = false, closed = false): PanelState {
  return { rect: toFraction(clampRect(rect, bounds), bounds), z, minimized, closed };
}

export function defaultWorkspace(bounds: Rect, t = 0): WorkspaceState {
  const r = defaultRects(bounds);
  return {
    panels: { nav: panel(r.nav, bounds, 1), main: panel(r.main, bounds, 2), voice: panel(r.voice, bounds, 3) },
    roster: "closed",
    preset: null,
    t,
  };
}

/**
 * Presets from the command rail:
 * - focus: just the active view, centred and roomy; navigator minimized, roster and voice tucked away.
 * - multitask: navigator, chat and the live voice grid tiled side by side (roster docked if no call).
 * - minimal: everything minimized into glass pills along the bottom edge.
 */
export function applyPreset(state: WorkspaceState, preset: Preset, bounds: Rect, opts: { voiceAvailable: boolean }, t = Date.now()): WorkspaceState {
  const zs = Object.fromEntries(PANEL_IDS.map((id) => [id, state.panels[id].z])) as Record<PanelId, number>;
  const top = Math.max(...Object.values(zs));
  const keep = (id: PanelId, patch: Partial<PanelState>): PanelState => ({ ...state.panels[id], ...patch });

  if (preset === "minimal") {
    return { ...state, preset, t, roster: "closed", panels: { nav: keep("nav", { minimized: true }), main: keep("main", { minimized: true }), voice: keep("voice", { minimized: true }) } };
  }
  if (preset === "focus") {
    const w = Math.max(MIN_W, Math.min(bounds.w, Math.max(bounds.w * 0.7, Math.min(bounds.w, 960))));
    const main = { x: bounds.x + (bounds.w - w) / 2, y: bounds.y, w, h: bounds.h };
    return {
      ...state,
      preset,
      t,
      roster: "closed",
      panels: { nav: keep("nav", { minimized: true }), main: panel(main, bounds, top + 1), voice: keep("voice", { minimized: true }) },
    };
  }
  // multitask
  const cols = opts.voiceAvailable ? 3 : 2;
  const navW = Math.max(MIN_W, Math.min(320, bounds.w * 0.24));
  const voiceW = opts.voiceAvailable ? Math.max(MIN_W, bounds.w * 0.3) : 0;
  const mainW = Math.max(MIN_W, bounds.w - navW - voiceW - GAP * (cols - 1));
  const nav = column(bounds, bounds.x, navW);
  const main = column(bounds, nav.x + navW + GAP, mainW);
  const voice = column(bounds, main.x + mainW + GAP, voiceW || MIN_W);
  return {
    ...state,
    preset,
    t,
    roster: opts.voiceAvailable ? "closed" : "docked",
    panels: {
      nav: panel(nav, bounds, top + 1),
      main: panel(main, bounds, top + 2),
      voice: opts.voiceAvailable ? panel(voice, bounds, top + 3) : keep("voice", { minimized: false }),
    },
  };
}

// ---- persistence ---------------------------------------------------------------------------

const fraction = z.number().min(-1).max(2);
const rectSchema = z.object({ x: fraction, y: fraction, w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) });
const panelSchema = z.object({ rect: rectSchema, z: z.number().int().min(0).max(1_000_000), minimized: z.boolean(), closed: z.boolean() });
const workspaceSchema = z.object({
  panels: z.object({ nav: panelSchema, main: panelSchema, voice: panelSchema }),
  roster: z.enum(["closed", "open", "docked"]),
  preset: z.enum(["focus", "multitask", "minimal"]).nullable(),
  t: z.number().nonnegative(),
});

/** Validates a stored layout (localStorage or user metadata); anything malformed is ignored. */
export function parseWorkspace(raw: unknown): WorkspaceState | null {
  const parsed = workspaceSchema.safeParse(typeof raw === "string" ? safeJson(raw) : raw);
  return parsed.success ? parsed.data : null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The newer of two saved layouts. */
export function newestWorkspace(...candidates: (WorkspaceState | null)[]): WorkspaceState | null {
  return candidates.reduce<WorkspaceState | null>((best, c) => (c && (!best || c.t > best.t) ? c : best), null);
}

/** Highest z in use (the next raise goes above it). */
export function topZ(state: WorkspaceState) {
  return Math.max(...PANEL_IDS.map((id) => state.panels[id].z));
}

/** Brings one panel above the rest. Returns the same object when it's already on top (no re-render). */
export function raisePanel(state: WorkspaceState, id: PanelId): WorkspaceState {
  const top = topZ(state);
  const zCount = PANEL_IDS.filter((p) => state.panels[p].z === top).length;
  if (state.panels[id].z === top && zCount === 1) return state;
  return { ...state, panels: { ...state.panels, [id]: { ...state.panels[id], z: top + 1 } } };
}
