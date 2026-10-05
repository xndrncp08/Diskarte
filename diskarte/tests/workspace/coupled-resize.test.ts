import { describe, expect, it } from "vitest";
import { coupledNeighbours, coupledResize, GAP, MIN_H, MIN_W, type Rect, type Rects } from "@/lib/workspace";

const B: Rect = { x: 0, y: 0, w: 1200, h: 800 };

/** nav | main | voice, docked with the standard gap, filling the canvas. */
const ROW: Rects = {
  nav: { x: 0, y: 0, w: 320, h: 800 },
  main: { x: 332, y: 0, w: 500, h: 800 },
  voice: { x: 844, y: 0, w: 356, h: 800 },
};

const seams = (r: Rects) => [r.main!.x - (r.nav!.x + r.nav!.w), r.voice!.x - (r.main!.x + r.main!.w)];
const right = (r: Rect) => r.x + r.w;

describe("coupledNeighbours", () => {
  it("finds panels docked across a shared edge: the gap, touching, or within the 8 px threshold", () => {
    expect(coupledNeighbours(ROW, "nav", "e")).toEqual(["main"]);
    expect(coupledNeighbours(ROW, "main", "w")).toEqual(["nav"]);
    expect(coupledNeighbours(ROW, "main", "e")).toEqual(["voice"]);
    const touching: Rects = { nav: ROW.nav, main: { ...ROW.main!, x: 320 } };
    expect(coupledNeighbours(touching, "nav", "e")).toEqual(["main"]);
    const loose: Rects = { nav: ROW.nav, main: { ...ROW.main!, x: 320 + GAP + 8 } };
    expect(coupledNeighbours(loose, "nav", "e")).toEqual(["main"]);
  });

  it("ignores panels that are too far away or don't share any of the edge", () => {
    expect(coupledNeighbours({ nav: ROW.nav, main: { ...ROW.main!, x: 320 + GAP + 9 } }, "nav", "e")).toEqual([]);
    expect(coupledNeighbours({ nav: { ...ROW.nav!, h: 300 }, main: { ...ROW.main!, y: 400, h: 400 } }, "nav", "e")).toEqual([]);
    expect(coupledNeighbours(ROW, "nav", "w")).toEqual([]);
  });
});

describe("coupledResize", () => {
  it("pulling a shared edge outward compresses the docked neighbour by exactly the same amount", () => {
    const r = coupledResize(ROW, "nav", "e", 80, 0, B);
    expect(r.nav).toMatchObject({ x: 0, w: 400 });
    expect(r.main).toMatchObject({ x: 412, w: 420 });
    expect(right(r.main!)).toBe(right(ROW.main!));
    expect(r.voice).toEqual(ROW.voice);
    expect(seams(r)).toEqual([GAP, GAP]);
  });

  it("shrinking a panel along a shared edge expands the neighbour by the same delta — no gap opens", () => {
    const r = coupledResize(ROW, "main", "w", 0, 0, B);
    expect(r).toEqual(ROW);
    const s = coupledResize(ROW, "main", "e", -100, 0, B);
    expect(s.main!.w).toBe(400);
    expect(s.voice).toMatchObject({ x: 744, w: 456 });
    expect(seams(s)).toEqual([GAP, GAP]);
  });

  it("once the neighbour reaches its minimum, pushes the docked block along — then stops at the canvas", () => {
    // main can give 180 px before hitting 320; beyond that it is pushed and squeezes voice (36 px spare).
    const r = coupledResize(ROW, "nav", "e", 200, 0, B);
    expect(r.nav!.w).toBe(520);
    expect(r.main).toMatchObject({ w: MIN_W, x: 532 });
    expect(r.voice).toMatchObject({ x: 864, w: 336 });
    expect(seams(r)).toEqual([GAP, GAP]);
    // Everything downstream at its minimum against the edge: no further growth, no overlap.
    const max = coupledResize(ROW, "nav", "e", 10_000, 0, B);
    expect(max.main!.w).toBe(MIN_W);
    expect(max.voice).toMatchObject({ w: MIN_W, x: 1200 - MIN_W });
    expect(max.nav!.w).toBe(1200 - 2 * MIN_W - 2 * GAP);
    expect(seams(max)).toEqual([GAP, GAP]);
  });

  it("pushes into free space at the end of the block before compressing further", () => {
    const short: Rects = { nav: ROW.nav, main: { ...ROW.main!, w: MIN_W } }; // main ends at 652, canvas at 1200
    const r = coupledResize(short, "nav", "e", 100, 0, B);
    expect(r.main).toMatchObject({ x: 432, w: MIN_W });
    expect(r.nav!.w).toBe(420);
  });

  it("never lets the dragged panel itself go below its minimum", () => {
    const r = coupledResize(ROW, "nav", "e", -500, 0, B);
    expect(r.nav!.w).toBe(MIN_W);
    expect(r.main).toEqual(ROW.main);
  });

  it("works from leading edges too (the left edge of the right-hand panel)", () => {
    const r = coupledResize(ROW, "voice", "w", -60, 0, B);
    expect(r.voice).toMatchObject({ x: 784, w: 416 });
    expect(r.main).toMatchObject({ x: 332, w: 440 });
    expect(seams(r)).toEqual([GAP, GAP]);
  });

  it("couples vertically stacked panels on the vertical axis, and corners on both", () => {
    const stack: Rects = { main: { x: 0, y: 0, w: 600, h: 400 }, voice: { x: 0, y: 412, w: 600, h: 388 }, nav: { x: 612, y: 0, w: 588, h: 800 } };
    const r = coupledResize(stack, "main", "s", 0, 60, B);
    expect(r.main!.h).toBe(460);
    expect(r.voice).toMatchObject({ y: 472, h: 328 });
    const c = coupledResize(stack, "main", "se", 40, 60, B);
    expect(c.main).toMatchObject({ w: 640, h: 460 });
    expect(c.nav).toMatchObject({ x: 652, w: 548 });
    expect(c.voice).toMatchObject({ y: 472, h: 328 });
    expect(c.voice!.h).toBeGreaterThanOrEqual(MIN_H);
  });

  it("moves several panels docked along one edge together", () => {
    const two: Rects = { nav: { x: 0, y: 0, w: 400, h: 800 }, main: { x: 412, y: 0, w: 788, h: 394 }, voice: { x: 412, y: 406, w: 788, h: 394 } };
    const r = coupledResize(two, "nav", "e", 50, 0, B);
    expect(r.main).toMatchObject({ x: 462, w: 738 });
    expect(r.voice).toMatchObject({ x: 462, w: 738 });
  });
});
