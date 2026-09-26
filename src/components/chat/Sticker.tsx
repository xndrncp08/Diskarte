import type { ReactNode } from "react";
import { getSticker } from "@/lib/stickers";
import { cn } from "@/lib/utils";

const PIXEL = { fontFamily: "var(--font-pixel)" } as const;

/** Word sticker: a tilted retro badge with a pixel outline and drop shadow. */
function Word({ text, bg, fg = "#0b1020", accent, tilt = -6, size = 20 }: { text: string; bg: string; fg?: string; accent: string; tilt?: number; size?: number }) {
  const lines = text.split("\n");
  return (
    <g transform={`rotate(${tilt} 80 80)`}>
      <rect x="14" y="44" width="136" height="80" rx="10" fill="#0b1020" />
      <rect x="8" y="38" width="136" height="80" rx="10" fill={bg} stroke="#0b1020" strokeWidth="5" />
      <rect x="16" y="46" width="24" height="6" rx="3" fill="#fff" opacity=".7" />
      <circle cx="136" cy="44" r="12" fill={accent} stroke="#0b1020" strokeWidth="4" />
      {lines.map((line, i) => (
        <text
          key={line}
          x="76"
          y={78 + (i - (lines.length - 1) / 2) * (size + 6) + size / 3}
          textAnchor="middle"
          fontSize={size}
          fill={fg}
          style={PIXEL}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

const ART: Record<string, ReactNode> = {
  "sana-all": <Word text={"SANA\nALL"} bg="#FFB800" accent="#ff5fa2" />,
  charot: <Word text="CHAROT!" bg="#ff5fa2" fg="#fff" accent="#FFB800" tilt={5} size={17} />,
  petmalu: <Word text="PETMALU" bg="#22d3ee" accent="#FFB800" tilt={-4} size={16} />,
  lodi: <Word text="LODI" bg="#a78bfa" fg="#fff" accent="#FFB800" tilt={6} size={26} />,
  awit: <Word text="AWIT" bg="#94a3b8" accent="#38bdf8" tilt={-8} size={26} />,
  "g-na-g": <Word text={"G NA\nG!"} bg="#22c55e" accent="#FFB800" tilt={4} />,
  "salamat-po": <Word text={"SALAMAT\nPO"} bg="#fde68a" accent="#f43f5e" tilt={-3} size={15} />,
  ingat: <Word text="INGAT!" bg="#f97316" fg="#fff" accent="#22d3ee" tilt={5} size={20} />,
  jeepney: (
    <g>
      <ellipse cx="80" cy="134" rx="62" ry="7" fill="#000" opacity=".35" />
      <path d="M22 60h110l12 22v34H18V82z" fill="#e2e8f0" stroke="#0b1020" strokeWidth="5" strokeLinejoin="round" />
      <path d="M26 50h104l6 10H20z" fill="#FFB800" stroke="#0b1020" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="68" width="22" height="16" rx="2" fill="#38bdf8" stroke="#0b1020" strokeWidth="4" />
      <rect x="58" y="68" width="22" height="16" rx="2" fill="#38bdf8" stroke="#0b1020" strokeWidth="4" />
      <rect x="86" y="68" width="22" height="16" rx="2" fill="#38bdf8" stroke="#0b1020" strokeWidth="4" />
      <path d="M20 96h124" stroke="#ef4444" strokeWidth="6" />
      <path d="M20 104h124" stroke="#2563eb" strokeWidth="5" />
      <circle cx="46" cy="118" r="12" fill="#1e293b" stroke="#0b1020" strokeWidth="5" />
      <circle cx="116" cy="118" r="12" fill="#1e293b" stroke="#0b1020" strokeWidth="5" />
      <circle cx="46" cy="118" r="4" fill="#e2e8f0" />
      <circle cx="116" cy="118" r="4" fill="#e2e8f0" />
      <path d="M78 50V34l-8-6M84 50V34l8-6" stroke="#0b1020" strokeWidth="4" fill="none" />
      <circle cx="68" cy="26" r="5" fill="#FFB800" stroke="#0b1020" strokeWidth="3" />
      <circle cx="94" cy="26" r="5" fill="#FFB800" stroke="#0b1020" strokeWidth="3" />
      <text x="80" y="60" textAnchor="middle" fontSize="7" fill="#0b1020" style={PIXEL}>
        CUBAO
      </text>
    </g>
  ),
  "halo-halo": (
    <g>
      <ellipse cx="80" cy="140" rx="44" ry="6" fill="#000" opacity=".35" />
      <path d="M40 66h80l-12 66H52z" fill="#e0f2fe" fillOpacity=".85" stroke="#0b1020" strokeWidth="5" strokeLinejoin="round" />
      <path d="M46 100h68l-4 18H50z" fill="#a855f7" />
      <path d="M44 84h72l-2 16H46z" fill="#f472b6" />
      <circle cx="60" cy="112" r="4" fill="#dc2626" />
      <circle cx="98" cy="110" r="4" fill="#16a34a" />
      <path d="M36 66c4-30 84-30 88 0z" fill="#fff" stroke="#0b1020" strokeWidth="5" />
      <ellipse cx="80" cy="44" rx="18" ry="12" fill="#7c3aed" stroke="#0b1020" strokeWidth="4" />
      <rect x="92" y="26" width="16" height="14" rx="2" fill="#fde047" stroke="#0b1020" strokeWidth="4" transform="rotate(12 100 33)" />
      <path d="M110 70l18-52" stroke="#0b1020" strokeWidth="6" strokeLinecap="round" />
      <path d="M110 70l18-52" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  kape: (
    <g>
      <ellipse cx="78" cy="138" rx="50" ry="6" fill="#000" opacity=".35" />
      <path d="M36 62h84v50a22 22 0 0 1-22 22H58a22 22 0 0 1-22-22z" fill="#f8fafc" stroke="#0b1020" strokeWidth="5" />
      <path d="M120 74h8a14 14 0 0 1 0 28h-8" fill="none" stroke="#0b1020" strokeWidth="5" />
      <ellipse cx="78" cy="64" rx="40" ry="7" fill="#78350f" stroke="#0b1020" strokeWidth="4" />
      <path d="M60 50c-6-8 6-12 0-22M78 48c-6-8 6-12 0-22M96 50c-6-8 6-12 0-22" stroke="#cbd5e1" strokeWidth="4" fill="none" strokeLinecap="round" />
      <text x="78" y="104" textAnchor="middle" fontSize="10" fill="#b91c1c" style={PIXEL}>
        3in1
      </text>
    </g>
  ),
  tsinelas: (
    <g>
      <ellipse cx="80" cy="140" rx="54" ry="6" fill="#000" opacity=".35" />
      <g transform="rotate(-14 60 86)">
        <rect x="34" y="30" width="44" height="104" rx="22" fill="#22c55e" stroke="#0b1020" strokeWidth="5" />
        <path d="M40 72l16-18 16 18" stroke="#1d4ed8" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
      <g transform="rotate(12 104 86)">
        <rect x="84" y="34" width="44" height="100" rx="22" fill="#22c55e" stroke="#0b1020" strokeWidth="5" />
        <path d="M90 76l16-18 16 18" stroke="#1d4ed8" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
    </g>
  ),
};

/** Renders a built-in sticker (unknown ids render a neutral placeholder). */
export function Sticker({ id, size = 144, className }: { id: string; size?: number; className?: string }) {
  const def = getSticker(id);
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      role="img"
      aria-label={def ? `Sticker: ${def.label}` : "Sticker"}
      className={cn("shrink-0 drop-shadow-[0_4px_10px_rgb(0_0_0_/_0.35)]", className)}
      data-testid="sticker"
      data-sticker={id}
    >
      {ART[id] ?? <Word text="?" bg="#334155" fg="#fff" accent="#64748b" tilt={0} />}
    </svg>
  );
}
