import { useId, type SVGProps } from "react";

export type LogoVariant = "badge" | "mascot";

export interface DiskarteLogoProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered width/height in px (the mark is square). */
  size?: number | string;
  /**
   * `badge`  – full app icon: midnight disc, Philippine sun, waves and sparkles.
   * `mascot` – just the salakot-wearing chat bubble with sun rays, for lockups.
   */
  variant?: LogoVariant;
  /** Bubble colour scheme for the mascot variant. `light` = white bubble (dark UIs). */
  tone?: "light" | "dark";
  title?: string;
}

/** Stable, CSS-safe id prefix so multiple logos on one page never share gradient ids. */
export function useSvgIds(prefix: string) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (name: string) => `${prefix}-${raw}-${name}`;
}

const INK = "#0B1020";
const GOLD = "#FFB800";
const GOLD_DEEP = "#EAB308";
const CREAM = "#FFF8EC";

/** Four-point sparkle centred on (cx, cy). */
export function sparklePath(cx: number, cy: number, r: number) {
  const k = r * 0.28;
  return `M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;
}

/** Philippine-sun style ray: a tapered blade from innerR to outerR along `angle` (deg). */
function rayPath(cx: number, cy: number, angle: number, innerR: number, outerR: number, innerW: number, outerW: number) {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const px = -uy;
  const py = ux;
  const pts = [
    [cx + ux * innerR + px * innerW, cy + uy * innerR + py * innerW],
    [cx + ux * outerR + px * outerW, cy + uy * outerR + py * outerW],
    [cx + ux * (outerR + outerW * 0.9), cy + uy * (outerR + outerW * 0.9)],
    [cx + ux * outerR - px * outerW, cy + uy * outerR - py * outerW],
    [cx + ux * innerR - px * innerW, cy + uy * innerR - py * innerW],
  ];
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
}

const SUN = { cx: 344, cy: 176, r: 64 };
const MAIN_RAYS = [-165, -120, -75, -30, 15, 60].map((angle) =>
  rayPath(SUN.cx, SUN.cy, angle, SUN.r + 6, SUN.r + 88, 12, 20),
);
const MINOR_RAYS = [-142, -97, -52, -7, 38].flatMap((angle) => [
  rayPath(SUN.cx, SUN.cy, angle - 6, SUN.r + 12, SUN.r + 60, 3, 5),
  rayPath(SUN.cx, SUN.cy, angle + 6, SUN.r + 12, SUN.r + 60, 3, 5),
]);

/** Salakot cone: apex, left brim tip, right brim tip. */
const HAT = {
  apex: [196, 104] as const,
  left: [70, 296] as const,
  right: [398, 212] as const,
};
const HAT_CONE = `M${HAT.apex[0]} ${HAT.apex[1]} L${HAT.left[0]} ${HAT.left[1]} Q246 250 ${HAT.right[0]} ${HAT.right[1]} Z`;
const HAT_BRIM = `M${HAT.left[0]} ${HAT.left[1]} Q246 250 ${HAT.right[0]} ${HAT.right[1]} Q404 238 380 250 Q250 300 96 318 Q66 318 ${HAT.left[0]} ${HAT.left[1]} Z`;

/** Weave: radial ribs from the apex plus curved rings parallel to the brim. */
const BRIM_CTRL = [246, 250] as const;
/** Point on the brim's quadratic curve at parameter t. */
function brimPoint(t: number) {
  const u = 1 - t;
  return [
    u * u * HAT.left[0] + 2 * u * t * BRIM_CTRL[0] + t * t * HAT.right[0],
    u * u * HAT.left[1] + 2 * u * t * BRIM_CTRL[1] + t * t * HAT.right[1],
  ];
}
const WEAVE_RIBS = [0.16, 0.34, 0.54, 0.76].map((t) => {
  const [x, y] = brimPoint(t);
  return `M${HAT.apex[0]} ${HAT.apex[1]} L${x.toFixed(1)} ${y.toFixed(1)}`;
});
const WEAVE_RINGS = [0.3, 0.52, 0.74].map((t) => {
  const lx = HAT.apex[0] + (HAT.left[0] - HAT.apex[0]) * t;
  const ly = HAT.apex[1] + (HAT.left[1] - HAT.apex[1]) * t;
  const rx = HAT.apex[0] + (HAT.right[0] - HAT.apex[0]) * t;
  const ry = HAT.apex[1] + (HAT.right[1] - HAT.apex[1]) * t;
  const qx = HAT.apex[0] + (BRIM_CTRL[0] - HAT.apex[0]) * t;
  const qy = HAT.apex[1] + (BRIM_CTRL[1] - HAT.apex[1]) * t;
  return `M${lx.toFixed(1)} ${ly.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${rx.toFixed(1)} ${ry.toFixed(1)}`;
});

/** Chat bubble body (rounded rect) and tail, drawn in a -7° rotated frame. */
const BUBBLE_BODY = { x: 148, y: 236, w: 226, h: 160, rx: 50 };
/** Wound clockwise like the body rect so renderers that merge clip children (librsvg) keep the overlap. */
const BUBBLE_TAIL = "M176 340 L262 380 L170 452 Z";
const BUBBLE_ROTATE = "rotate(-7 261 316)";

function Mascot({ ids, bubble, eyes, outline }: { ids: (n: string) => string; bubble: string; eyes: string; outline: string }) {
  const shade = bubble === CREAM ? "#AEB9D6" : "#020617";
  return (
    <g>
      {/* Sun */}
      <g>
        {MINOR_RAYS.map((d, i) => (
          <path key={`m${i}`} d={d} fill={GOLD_DEEP} opacity={0.85} />
        ))}
        {MAIN_RAYS.map((d, i) => (
          <path key={`r${i}`} d={d} fill={`url(#${ids("ray")})`} />
        ))}
        <circle cx={SUN.cx} cy={SUN.cy} r={SUN.r} fill={`url(#${ids("sun")})`} />
      </g>

      {/* Chat bubble */}
      <g transform={BUBBLE_ROTATE}>
        <g stroke={outline} strokeWidth={16} strokeLinejoin="round">
          <rect {...rectProps(BUBBLE_BODY)} fill={outline} />
          <path d={BUBBLE_TAIL} fill={outline} />
        </g>
        <g clipPath={`url(#${ids("bubble")})`}>
          <rect x={100} y={200} width={320} height={280} fill={shade} />
          <rect {...rectProps({ ...BUBBLE_BODY, x: BUBBLE_BODY.x + 12, y: BUBBLE_BODY.y - 10 })} fill={bubble} />
          <path d="M190 336 L186 430 L262 372 Z" fill={bubble} />
        </g>
        {/* Eyes */}
        <rect x={214} y={290} width={30} height={60} rx={15} fill={eyes} />
        <rect x={290} y={286} width={30} height={60} rx={15} fill={eyes} />
      </g>

      {/* Salakot */}
      <g strokeLinejoin="round">
        <path d={HAT_BRIM} fill={`url(#${ids("brim")})`} stroke={outline} strokeWidth={8} />
        <path d={HAT_CONE} fill={`url(#${ids("straw")})`} stroke={outline} strokeWidth={8} />
        <g clipPath={`url(#${ids("cone")})`} stroke="#B7791F" strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.75}>
          {WEAVE_RIBS.map((d, i) => (
            <path key={`rib${i}`} d={d} />
          ))}
          {WEAVE_RINGS.map((d, i) => (
            <path key={`ring${i}`} d={d} />
          ))}
        </g>
        <path d={`M${HAT.apex[0]} ${HAT.apex[1] + 6} L${HAT.left[0] + 22} ${HAT.left[1] - 14}`} stroke="#FFE7A3" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
      </g>
    </g>
  );
}

function rectProps(r: { x: number; y: number; w: number; h: number; rx: number }) {
  return { x: r.x, y: r.y, width: r.w, height: r.h, rx: r.rx };
}

function Defs({ ids }: { ids: (n: string) => string }) {
  return (
    <defs>
      <radialGradient id={ids("sun")} cx="45%" cy="40%" r="65%">
        <stop offset="0%" stopColor="#FFE27A" />
        <stop offset="60%" stopColor={GOLD} />
        <stop offset="100%" stopColor={GOLD_DEEP} />
      </radialGradient>
      <linearGradient id={ids("ray")} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFD54A" />
        <stop offset="100%" stopColor={GOLD} />
      </linearGradient>
      <linearGradient id={ids("straw")} x1="0.3" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#FFE08A" />
        <stop offset="55%" stopColor="#F5C451" />
        <stop offset="100%" stopColor="#E0A437" />
      </linearGradient>
      <linearGradient id={ids("brim")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C98A3A" />
        <stop offset="100%" stopColor="#8A5220" />
      </linearGradient>
      <linearGradient id={ids("wave")} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={GOLD} />
        <stop offset="100%" stopColor={GOLD_DEEP} />
      </linearGradient>
      <clipPath id={ids("cone")}>
        <path d={HAT_CONE} />
      </clipPath>
      <clipPath id={ids("bubble")}>
        <rect {...rectProps(BUBBLE_BODY)} />
        <path d={BUBBLE_TAIL} />
      </clipPath>
      <clipPath id={ids("disc")}>
        <circle cx={256} cy={270} r={210} />
      </clipPath>
    </defs>
  );
}

/** Mascot artwork as a bare `<g>` in a 512×512 coordinate space (used by lockups and avatars). */
export function DiskarteMascotArt({ tone = "light" }: { tone?: "light" | "dark" }) {
  const ids = useSvgIds("dm");
  const light = tone === "light";
  return (
    <g>
      <Defs ids={ids} />
      <Mascot ids={ids} bubble={light ? CREAM : "#1E293B"} eyes={light ? INK : CREAM} outline={light ? INK : "#0F172A"} />
    </g>
  );
}

/**
 * Official Diskarte mark: a rounded chat-bubble mascot wearing a woven salakot,
 * set against the golden rays of the Philippine sun with sparkle accents.
 * Pure inline SVG so it stays razor sharp at every size.
 */
export function DiskarteLogo({ size = 40, variant = "badge", tone = "light", title = "Diskarte", ...props }: DiskarteLogoProps) {
  const ids = useSvgIds("dl");
  const titleId = ids("title");
  const light = tone === "light";

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-labelledby={titleId}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="diskarte-logo"
      {...props}
    >
      <title id={titleId}>{title}</title>
      <Defs ids={ids} />
      {variant === "badge" ? (
        <>
          <circle cx={256} cy={270} r={210} fill="#0F172A" />
          <g clipPath={`url(#${ids("disc")})`}>
            <path d="M40 420 C130 392 210 380 300 400 C380 418 440 404 480 380 L480 520 L40 520 Z" fill={`url(#${ids("wave")})`} />
            <path d="M40 446 C140 420 220 414 310 430 C390 444 446 432 480 414 L480 520 L40 520 Z" fill="#E08A00" opacity={0.9} />
            <path d="M40 462 C150 440 230 440 316 456 C392 470 446 462 480 448 L480 520 L40 520 Z" fill="#1E3A8A" />
            <path d="M40 486 C150 470 240 474 320 486 C392 496 446 492 480 482 L480 520 L40 520 Z" fill="#172554" />
          </g>
          <path d={sparklePath(108, 356, 24)} fill={GOLD} />
          <path d={sparklePath(420, 340, 26)} fill={GOLD} />
          <path d={sparklePath(452, 400, 12)} fill={GOLD} opacity={0.8} />
          <Mascot ids={ids} bubble={CREAM} eyes={INK} outline={INK} />
        </>
      ) : (
        <>
          <path d={sparklePath(448, 300, 20)} fill={GOLD} />
          <path d={sparklePath(470, 360, 12)} fill={GOLD} />
          <Mascot ids={ids} bubble={light ? CREAM : "#1E293B"} eyes={light ? INK : CREAM} outline={light ? INK : "#0F172A"} />
        </>
      )}
    </svg>
  );
}

export default DiskarteLogo;
