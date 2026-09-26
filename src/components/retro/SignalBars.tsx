import { cn } from "@/lib/utils";

export type SignalLevel = 0 | 1 | 2 | 3 | 4;

const LABELS: Record<SignalLevel, string> = {
  0: "Offline",
  1: "Mahina ang signal",
  2: "Okay-okay lang",
  3: "Malakas",
  4: "Solid ang connection",
};

function colorFor(level: SignalLevel) {
  if (level <= 1) return "#EF4444";
  if (level === 2) return "#F59E0B";
  return "#22C55E";
}

/** Arcade-style signal meter: four stepped pixel bars, blinking red when disconnected. */
export function SignalBars({ level, className, showLabel = false }: { level: SignalLevel; className?: string; showLabel?: boolean }) {
  const color = colorFor(level);
  return (
    <span className={cn("inline-flex items-end gap-1.5", className)} role="img" aria-label={`Connection: ${LABELS[level]}`} data-level={level}>
      <svg width="18" height="14" viewBox="0 0 9 7" shapeRendering="crispEdges" className={cn("pixelated", level === 0 && "animate-blink")}>
        {[0, 1, 2, 3].map((i) => {
          const h = (i + 1) * 1.75;
          return <rect key={i} x={i * 2 + 0.5} y={7 - h} width="1.5" height={h} fill={i < level ? color : "rgb(255 255 255 / 0.18)"} />;
        })}
      </svg>
      {showLabel && <span className="font-silk text-[10px] uppercase tracking-wider" style={{ color }}>{LABELS[level]}</span>}
    </span>
  );
}
