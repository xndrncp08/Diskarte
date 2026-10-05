import { CanvasTexture, ExtrudeGeometry, LatheGeometry, RepeatWrapping, Shape, SRGBColorSpace, Vector2 } from "three";

/**
 * Geometry for the 3D mascot, derived from the official 2D mark (`DiskarteLogo`, 512 × 512, y down)
 * so the model reads as the same character: SVG units map to world units at 1/100, y flipped, with the
 * artwork's visual centre at the origin.
 */
const CENTER = { x: 293, y: 238 };
export const toWorld = (x: number, y: number): [number, number] => [(x - CENTER.x) / 100, -(y - CENTER.y) / 100];
const deg = (d: number) => (d * Math.PI) / 180;

// ---------------------------------------------------------------------------------------------
// Chat bubble: the rounded body (226 × 160, r 50) plus its tail, one closed outline so the frosted
// glass has no internal faces. The 2D mark rotates it −7° about (261, 316).
// ---------------------------------------------------------------------------------------------
export const BUBBLE_PIVOT = toWorld(261, 316);
export const BUBBLE_TILT = deg(7);
export const BUBBLE_DEPTH = 0.62;
export const BUBBLE_BEVEL = 0.26;

/** Outline in the bubble's local frame (pivot at the origin), y up. */
function bubbleShape(inset = 0) {
  const p = (x: number, y: number) => {
    const [wx, wy] = toWorld(x, y);
    return [wx - BUBBLE_PIVOT[0], wy - BUBBLE_PIVOT[1]] as const;
  };
  const left = 148 + inset;
  const right = 374 - inset;
  const top = 236 + inset;
  const bottom = 396 - inset;
  const r = 50 - inset * 0.6;
  const s = new Shape();
  s.moveTo(...p(left + r, top));
  s.lineTo(...p(right - r, top));
  s.quadraticCurveTo(...p(right, top), ...p(right, top + r));
  s.lineTo(...p(right, bottom - r));
  s.quadraticCurveTo(...p(right, bottom), ...p(right - r, bottom));
  // Bottom edge, then the tail sweeping down-left to its tip and back up into the left side.
  s.lineTo(...p(244, bottom));
  s.quadraticCurveTo(...p(206, 404 + inset * 0.2), ...p(172 + inset * 0.6, 446 - inset * 1.4));
  s.quadraticCurveTo(...p(170, 404), ...p(left, bottom - r - 6));
  s.lineTo(...p(left, top + r));
  s.quadraticCurveTo(...p(left, top), ...p(left + r, top));
  return s;
}

function extrude(shape: Shape, depth: number, bevel: number) {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 10, curveSegments: 36 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** The frosted-glass shell. */
export function createBubbleShell() {
  return extrude(bubbleShape(), BUBBLE_DEPTH, BUBBLE_BEVEL);
}

/** An opaque, softly lit core inside the shell: the glass blurs it into a glowing cream body. */
export function createBubbleCore() {
  return extrude(bubbleShape(26), BUBBLE_DEPTH * 0.55, 0.12);
}

/** Eye centres (local bubble frame) — the 2D mark's 30 × 60 rounded rects. */
export const EYES = [toWorld(229, 320), toWorld(305, 316)].map(([x, y]) => [x - BUBBLE_PIVOT[0], y - BUBBLE_PIVOT[1]] as const);

// ---------------------------------------------------------------------------------------------
// Salakot: the 2D cone runs from its apex (196, 104) to a brim spanning (70, 296)–(398, 212), so
// it sits on the bubble leaning ~14° left. Modelled as a lathe: a slightly concave crown flaring
// into a thin brim with a rolled edge.
// ---------------------------------------------------------------------------------------------
export const HAT_BASE = toWorld(234, 244);
export const HAT_LEAN = deg(14);
export const HAT_RADIUS = 1.58;
export const HAT_HEIGHT = 1.42;

export function createHatGeometry() {
  const outer: Vector2[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Concave crown: the radius grows faster near the brim than at the peak.
    const r = HAT_RADIUS * (1 - Math.pow(1 - t, 1.55));
    const y = HAT_HEIGHT * (1 - t) + 0.02;
    outer.push(new Vector2(Math.max(r, 0.0001), y));
  }
  // Rolled brim edge, then back along the underside (a thin shell).
  outer.push(new Vector2(HAT_RADIUS + 0.04, -0.02), new Vector2(HAT_RADIUS - 0.02, -0.07));
  const inner: Vector2[] = [];
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = (HAT_RADIUS - 0.09) * (1 - Math.pow(1 - t, 1.55));
    const y = (HAT_HEIGHT - 0.1) * (1 - t) - 0.04;
    inner.push(new Vector2(Math.max(r, 0.0001), y));
  }
  const g = new LatheGeometry([...outer, ...inner], 128);
  g.computeVertexNormals();
  return g;
}

/**
 * Basket-weave straw: alternating over/under strips drawn on a canvas, used as the colour map and
 * (with its luminance) the bump map, so the weave catches light as the hat turns.
 */
export function createWeaveTexture() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cell = size / 16;
  ctx.fillStyle = "#c98f35";
  ctx.fillRect(0, 0, size, size);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const horizontal = (row + col) % 2 === 0;
      const x = col * cell;
      const y = row * cell;
      const g = horizontal ? ctx.createLinearGradient(x, y, x, y + cell) : ctx.createLinearGradient(x, y, x + cell, y);
      g.addColorStop(0, "#f7d488");
      g.addColorStop(0.5, "#ffe7a6");
      g.addColorStop(1, "#d9a446");
      ctx.fillStyle = g;
      const pad = cell * 0.08;
      ctx.beginPath();
      ctx.roundRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2, cell * 0.18);
      ctx.fill();
      // Fibre lines along each strip.
      ctx.strokeStyle = "rgba(150, 95, 25, 0.35)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x + pad, y + (cell * k) / 4);
          ctx.lineTo(x + cell - pad, y + (cell * k) / 4);
        } else {
          ctx.moveTo(x + (cell * k) / 4, y + pad);
          ctx.lineTo(x + (cell * k) / 4, y + cell - pad);
        }
        ctx.stroke();
      }
    }
  }
  const texture = new CanvasTexture(c);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 3);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ---------------------------------------------------------------------------------------------
// Philippine sun at (344, 176), r 64: six tapered main rays and five pairs of minor rays, angles as
// in the 2D mark (degrees, clockwise from +x in SVG space).
// ---------------------------------------------------------------------------------------------
export const SUN_CENTER = toWorld(344, 176);
export const SUN_RADIUS = 0.64;
const MAIN_RAY_ANGLES = [-165, -120, -75, -30, 15, 60];
const MINOR_RAY_ANGLES = [-142, -97, -52, -7, 38].flatMap((a) => [a - 6, a + 6]);

/** A tapered blade along +x from `inner` to `outer`, pointed at the tip. */
function rayShape(inner: number, outer: number, innerW: number, outerW: number) {
  const s = new Shape();
  s.moveTo(inner, innerW);
  s.lineTo(outer, outerW);
  s.lineTo(outer + outerW * 0.9, 0);
  s.lineTo(outer, -outerW);
  s.lineTo(inner, -innerW);
  s.closePath();
  return s;
}

export interface RaySpec {
  angle: number;
  main: boolean;
}

/** World-space angle (radians, counter-clockwise) for each ray. */
export const RAYS: RaySpec[] = [
  ...MAIN_RAY_ANGLES.map((a) => ({ angle: deg(-a), main: true })),
  ...MINOR_RAY_ANGLES.map((a) => ({ angle: deg(-a), main: false })),
];

export function createRayGeometry(main: boolean) {
  const shape = main ? rayShape(SUN_RADIUS + 0.06, SUN_RADIUS + 0.88, 0.12, 0.2) : rayShape(SUN_RADIUS + 0.12, SUN_RADIUS + 0.6, 0.03, 0.05);
  const g = new ExtrudeGeometry(shape, { depth: main ? 0.08 : 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 });
  g.translate(0, 0, -0.04);
  return g;
}

/** Four-point sparkle (the 2D mark's sparklePath), extruded. */
export function createSparkleGeometry(r: number) {
  const k = r * 0.28;
  const s = new Shape();
  s.moveTo(0, r);
  s.quadraticCurveTo(k, k, r, 0);
  s.quadraticCurveTo(k, -k, 0, -r);
  s.quadraticCurveTo(-k, -k, -r, 0);
  s.quadraticCurveTo(-k, k, 0, r);
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -0.025);
  return g;
}

export const SPARKLES = [
  { at: toWorld(448, 300), r: 0.2 },
  { at: toWorld(470, 360), r: 0.12 },
];
