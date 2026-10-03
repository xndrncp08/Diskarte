import type { PresenceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const COLORS: Record<PresenceStatus | "offline", string> = {
  online: "#22C55E",
  idle: "#F59E0B",
  dnd: "#EF4444",
  invisible: "#64748B",
  offline: "#64748B",
};

/** Highlight ring around an avatar, matching its status colour. */
export const STATUS_RING: Record<PresenceStatus | "offline", string> = {
  online: "ring-signal-green/80",
  idle: "ring-signal-idle/80",
  dnd: "ring-signal-dnd/80",
  invisible: "ring-slate-500/70",
  offline: "ring-slate-500/70",
};

export const STATUS_LABELS: Record<PresenceStatus | "offline", string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible",
  offline: "Offline",
};

/**
 * 8-bit presence indicator: a chunky pixel "plus" drawn on a 5×5 grid with crisp edges.
 * Idle shows a moon notch, DND a bar, offline a hollow ring — same silhouettes as Discord, pixelated.
 */
export function PixelStatus({
  status,
  size = 12,
  className,
  ring = "#020617",
}: {
  status: PresenceStatus | "offline";
  size?: number;
  className?: string;
  ring?: string;
}) {
  const color = COLORS[status];
  const hollow = status === "offline" || status === "invisible";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className={cn("pixelated shrink-0", className)}
      role="img"
      aria-label={STATUS_LABELS[status]}
      data-status={status}
    >
      {/* ring */}
      <path d="M2 0h3v1h1v1h1v3h-1v1h-1v1h-3v-1h-1v-1h-1v-3h1v-1h1z" fill={ring} />
      {/* body */}
      <path d="M2 1h3v1h1v3h-1v1h-3v-1h-1v-3h1z" fill={color} />
      {hollow && <rect x="3" y="3" width="1" height="1" fill={ring} />}
      {status === "idle" && <path d="M2 1h2v1h-1v1h-2v-1h1z" fill={ring} />}
      {status === "dnd" && <rect x="2" y="3" width="3" height="1" fill={ring} />}
      {status === "online" && <rect x="2" y="2" width="1" height="1" fill="#86EFAC" />}
    </svg>
  );
}
