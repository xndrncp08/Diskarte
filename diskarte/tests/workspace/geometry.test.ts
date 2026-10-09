import { describe, expect, it } from "vitest";
import {
  applyPreset,
  clampRect,
  defaultWorkspace,
  fromFraction,
  GAP,
  MIN_H,
  MIN_W,
  newestWorkspace,
  parseWorkspace,
  raisePanel,
  reflowPanels,
  settleOnGrid,
  snapMove,
  snapResize,
  toFraction,
  type Rect,
} from "@/lib/workspace";

const B: Rect = { x: 0, y: 0, w: 1200, h: 800 };

describe("clampRect", () => {
  it("enforces the 320 × 240 minimum and keeps the panel fully on the canvas", () => {
    expect(clampRect({ x: -50, y: 700, w: 100, h: 50 }, B)).toEqual({ x: 0, y: 800 - MIN_H, w: MIN_W, h: MIN_H });
    expect(clampRect({ x: 1100, y: 0, w: 500, h: 900 }, B)).toEqual({ x: 700, y: 0, w: 500, h: 800 });
  });

  it("never asks for more than a tiny canvas has", () => {
    expect(clampRect({ x: 0, y: 0, w: 50, h: 50 }, { x: 0, y: 0, w: 300, h: 200 })).toEqual({ x: 0, y: 0, w: 300, h: 200 });
  });
});

describe("snapMove", () => {
  it("pulls an edge within 8 px onto the canvas edge", () => {
    const { rect, snapped } = snapMove({ x: 6, y: 300, w: 400, h: 300 }, [], B);
    expect(rect.x).toBe(0);
    expect(snapped).toEqual({ x: true, y: false });
    expect(snapMove({ x: 1200 - 400 - 7, y: 300, w: 400, h: 300 }, [], B).rect.x).toBe(800);
  });

  it("leaves edges alone beyond the 8 px threshold", () => {
    const { rect, snapped } = snapMove({ x: 9, y: 300, w: 400, h: 300 }, [], B);
    expect(rect.x).toBe(9);
    expect(snapped.x).toBe(false);
  });

  it("docks beside a neighbouring panel with a tidy gap, for side-by-side tiling", () => {
    const left: Rect = { x: 0, y: 0, w: 300, h: 800 };
    const { rect } = snapMove({ x: 300 + GAP + 5, y: 100, w: 400, h: 300 }, [left], B);
    expect(rect.x).toBe(300 + GAP);
    // …and from the other side: the right edge stops just before it.
    const right: Rect = { x: 800, y: 0, w: 400, h: 800 };
    expect(snapMove({ x: 800 - GAP - 400 + 6, y: 100, w: 400, h: 300 }, [right], B).rect.x).toBe(800 - GAP - 400);
  });

  it("aligns edges with another panel", () => {
    const other: Rect = { x: 400, y: 120, w: 400, h: 300 };
    expect(snapMove({ x: 900, y: 125, w: 300, h: 300 }, [other], B).rect.y).toBe(120);
  });

  it("only docks (with the gap) against panels it actually sits beside", () => {
    const farAbove: Rect = { x: 0, y: 0, w: 300, h: 100 };
    expect(snapMove({ x: 300 + GAP + 4, y: 500, w: 400, h: 200 }, [farAbove], B).rect.x).toBe(300 + GAP + 4);
  });
});

describe("snapResize", () => {
  it("resizes from any edge or corner but never below 320 × 240", () => {
    const r: Rect = { x: 100, y: 100, w: 500, h: 400 };
    expect(snapResize({ ...r, w: 100, h: 100 }, "se", [], B)).toMatchObject({ x: 100, y: 100, w: MIN_W, h: MIN_H });
    // Dragging the west edge far right stops at the minimum width, anchored on the east edge.
    expect(snapResize({ x: 590, y: 100, w: 10, h: 400 }, "w", [], { ...B })).toMatchObject({ w: MIN_W });
  });

  it("snaps the dragged edge to the canvas and to neighbours", () => {
    expect(snapResize({ x: 100, y: 100, w: 1095, h: 300 }, "e", [], B).w).toBe(1100);
    const neighbour: Rect = { x: 700, y: 0, w: 500, h: 800 };
    expect(snapResize({ x: 100, y: 100, w: 700 - GAP - 100 - 5, h: 300 }, "e", [neighbour], B).w).toBe(700 - GAP - 100);
  });
});

describe("settleOnGrid", () => {
  it("rounds free axes to the 8 px grid but keeps snapped ones exact", () => {
    expect(settleOnGrid({ x: 13, y: 21, w: 400, h: 300 }, { x: false, y: true }, B)).toMatchObject({ x: 16, y: 21 });
  });
});

describe("fractions", () => {
  it("round-trip across canvas sizes, so a layout scales with the window", () => {
    const f = toFraction({ x: 300, y: 0, w: 600, h: 400 }, B);
    expect(f).toEqual({ x: 0.25, y: 0, w: 0.5, h: 0.5 });
    expect(fromFraction(f, { x: 0, y: 0, w: 2400, h: 1600 })).toEqual({ x: 600, y: 0, w: 1200, h: 800 });
  });
});

describe("presets", () => {
  const base = defaultWorkspace(B);

  it("focus centres the active view and tucks everything else away", () => {
    const s = applyPreset(base, "focus", B, { voiceAvailable: true }, 5);
    expect(s.preset).toBe("focus");
    expect(s.roster).toBe("closed");
    expect(s.panels.nav.minimized).toBe(true);
    expect(s.panels.voice.minimized).toBe(true);
    const main = fromFraction(s.panels.main.rect, B);
    expect(main.x + main.w / 2).toBeCloseTo(600, 0);
    expect(s.panels.main.z).toBeGreaterThan(s.panels.nav.z);
  });

  it("multitask tiles navigator, chat and the voice grid without overlaps", () => {
    const s = applyPreset(base, "multitask", B, { voiceAvailable: true }, 5);
    const [nav, main, voice] = (["nav", "main", "voice"] as const).map((id) => fromFraction(s.panels[id].rect, B));
    expect(nav.x).toBe(0);
    expect(main.x).toBe(nav.x + nav.w + GAP);
    expect(voice.x).toBe(main.x + main.w + GAP);
    expect(voice.x + voice.w).toBeLessThanOrEqual(1200);
    for (const r of [nav, main, voice]) expect(r.w).toBeGreaterThanOrEqual(MIN_W);
  });

  it("multitask docks the roster when there's no call to tile", () => {
    expect(applyPreset(base, "multitask", B, { voiceAvailable: false }).roster).toBe("docked");
  });

  it("minimal dock minimizes every panel into the tray (a closed Control Center stays closed)", () => {
    const s = applyPreset(base, "minimal", B, { voiceAvailable: true });
    expect([s.panels.nav, s.panels.main, s.panels.voice].every((p) => p.minimized)).toBe(true);
    expect(s.panels.admin).toMatchObject({ closed: true, minimized: false });
  });
});

describe("reflowPanels", () => {
  it("keeps tiled panels apart when the canvas narrows (a roster docks): the right-edge panel shrinks", () => {
    const s = applyPreset(defaultWorkspace(B), "multitask", B, { voiceAvailable: false });
    const narrower: Rect = { ...B, w: B.w - 284 };
    const next = reflowPanels(s, B, narrower);
    const nav = fromFraction(next.panels.nav.rect, narrower);
    const main = fromFraction(next.panels.main.rect, narrower);
    expect(nav).toEqual(fromFraction(s.panels.nav.rect, B));
    expect(main.x).toBe(nav.x + nav.w + GAP);
    expect(main.x + main.w).toBe(narrower.w);
  });

  it("lets edge-attached panels grow back when the canvas widens, and leaves floating ones in place", () => {
    const s = defaultWorkspace(B);
    const floating = { ...s, panels: { ...s.panels, voice: { ...s.panels.voice, rect: toFraction({ x: 400, y: 100, w: 400, h: 300 }, B) } } };
    const wider: Rect = { ...B, w: 1500, h: 900 };
    const next = reflowPanels(floating, B, wider);
    expect(fromFraction(next.panels.main.rect, wider)).toMatchObject({ w: 1500 - 332, h: 900 });
    expect(fromFraction(next.panels.voice.rect, wider)).toEqual({ x: 400, y: 100, w: 400, h: 300 });
  });
});

describe("z-order", () => {
  it("raises a panel above the rest, and is a no-op when it is already on top", () => {
    const s = defaultWorkspace(B);
    const raised = raisePanel(s, "nav");
    expect(raised.panels.nav.z).toBeGreaterThan(raised.panels.main.z);
    expect(raisePanel(raised, "nav")).toBe(raised);
  });
});

describe("persistence", () => {
  it("accepts a valid layout and rejects tampered or malformed ones", () => {
    const s = defaultWorkspace(B, 42);
    expect(parseWorkspace(JSON.stringify(s))).toEqual(s);
    expect(parseWorkspace({ ...s, roster: "everywhere" })).toBeNull();
    expect(parseWorkspace({ ...s, panels: { ...s.panels, main: { ...s.panels.main, rect: { x: 0, y: 0, w: 99, h: 1 } } } })).toBeNull();
    expect(parseWorkspace("{not json")).toBeNull();
    expect(parseWorkspace(null)).toBeNull();
  });

  it("prefers whichever copy (this browser or the account) changed last", () => {
    const older = defaultWorkspace(B, 1);
    const newer = { ...defaultWorkspace(B, 2), roster: "docked" as const };
    expect(newestWorkspace(older, newer)).toBe(newer);
    expect(newestWorkspace(null, older)).toBe(older);
    expect(newestWorkspace(null, null)).toBeNull();
  });
});
