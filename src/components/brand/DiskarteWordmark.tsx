import type { SVGProps } from "react";
import { DiskarteMascotArt, sparklePath, useSvgIds } from "./DiskarteLogo";
import { WORDMARK_I_DOT, WORDMARK_TEXT_BOX, WORDMARK_TEXT_PATH } from "./wordmark-path";

export interface DiskarteWordmarkProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered height in px; width follows the lockup's aspect ratio. */
  height?: number;
  /** `light` = cream lettering for dark UIs, `dark` = ink lettering for light backgrounds. */
  tone?: "light" | "dark";
  /** Hide the mascot to get the bare brush lettering. */
  showMascot?: boolean;
  title?: string;
}

/** The mascot art occupies roughly x 60–450, y 16–462 of its 512 box; crop to that. */
const MASCOT_SCALE = 0.66;
const MASCOT_OFFSET = { x: -60 * MASCOT_SCALE, y: -16 * MASCOT_SCALE };
const MASCOT_WIDTH = (450 - 60) * MASCOT_SCALE;
const GAP = 14;
const TEXT_Y = 70;
const PAD_RIGHT = 12;
const HEIGHT = 300;

/** Brush-stroke underline in text coordinates, tapering from the "i" to the final "e". */
const SWOOSH =
  "M150 236 C300 214 520 198 748 192 C752 192 754 196 750 199 C600 206 420 220 214 246 C182 250 158 252 150 248 C144 245 145 237 150 236 Z";

/**
 * Horizontal lockup: the salakot chat mascot beside the "Diskarte" brush lettering
 * (Knewave outlines, pre-converted to paths) with a golden tittle and underline swoosh.
 */
export function DiskarteWordmark({
  height = 48,
  tone = "light",
  showMascot = true,
  title = "Diskarte",
  ...props
}: DiskarteWordmarkProps) {
  const ids = useSvgIds("dw");
  const titleId = ids("title");
  const ink = tone === "light" ? "#FFF8EC" : "#0B1020";
  const textX = showMascot ? MASCOT_WIDTH + GAP : 0;
  const width = textX + WORDMARK_TEXT_BOX.width + PAD_RIGHT;
  const scale = height / HEIGHT;

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={Math.round(width * scale)}
      height={height}
      role="img"
      aria-labelledby={titleId}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="diskarte-wordmark"
      {...props}
    >
      <title id={titleId}>{title}</title>
      <defs>
        <linearGradient id={ids("swoosh")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#FFB800" />
        </linearGradient>
      </defs>
      {showMascot && (
        <g transform={`translate(${MASCOT_OFFSET.x} ${MASCOT_OFFSET.y}) scale(${MASCOT_SCALE})`}>
          <DiskarteMascotArt tone={tone} />
        </g>
      )}
      <g transform={`translate(${textX} ${TEXT_Y - 30})`}>
        <path d={SWOOSH} fill={`url(#${ids("swoosh")})`} />
        <path d={WORDMARK_TEXT_PATH} fill={ink} />
        <circle cx={WORDMARK_I_DOT.cx} cy={WORDMARK_I_DOT.cy} r={WORDMARK_I_DOT.r} fill="#FFB800" />
        <path d={sparklePath(WORDMARK_TEXT_BOX.width - 6, 18, 14)} fill="#FFB800" />
      </g>
    </svg>
  );
}

export default DiskarteWordmark;
