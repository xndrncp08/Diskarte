import { resolveAvatarPreset } from "@/lib/profile";
import { cn } from "@/lib/utils";

/**
 * Compact salakot-mascot avatar (64-unit grid) recoloured per preset. Pure SVG so it stays sharp
 * from 16px member-list dots up to 128px profile headers.
 */
export function SalakotAvatar({ preset, size = 40, className, title }: { preset: string; size?: number; className?: string; title?: string }) {
  const p = resolveAvatarPreset(preset);
  const dark = p.bg === "#1E293B";
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-preset={preset}
    >
      <circle cx="32" cy="32" r="32" fill={p.bg} />
      {/* Sun rays behind the hat */}
      <g fill={dark ? "#FFB800" : "#FFFFFF"} opacity={dark ? 0.9 : 0.35}>
        <path d="M46 6 l3 9 -6 1z" />
        <path d="M58 16 l-7 7 -3 -5z" />
        <path d="M60 30 l-9 -1 1 -6z" />
      </g>
      {/* Bubble */}
      <g transform="rotate(-6 32 40)">
        <rect x="15" y="27" width="34" height="25" rx="9" fill="#0B1020" />
        <rect x="17" y="28.5" width="30.5" height="21.5" rx="7.5" fill={p.bubble} />
        <path d="M21 48 L19 58 L30 50 Z" fill={p.bubble} stroke="#0B1020" strokeWidth="2" strokeLinejoin="round" />
        <rect x="26" y="34" width="4.5" height="9" rx="2.25" fill="#0B1020" />
        <rect x="36" y="33.5" width="4.5" height="9" rx="2.25" fill="#0B1020" />
      </g>
      {/* Salakot */}
      <path d="M27 8 L8 30 Q33 23 56 22 Z" fill="#F5C451" stroke="#0B1020" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 30 Q33 23 56 22 Q57 25 54 26 Q33 28 11 33 Q7 33 8 30 Z" fill={p.band} stroke="#0B1020" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M27 8 L19 27 M27 8 L33 25 M27 8 L44 23" stroke="#B7791F" strokeWidth="1.2" opacity="0.8" />
    </svg>
  );
}
