import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Pulse's named sizes, radii, shadows and fonts (pulse.css): without them `text-pulse-body text-pulse-text` reads as two colours and loses the size.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["pulse-caption", "pulse-label", "pulse-body", "pulse-lead", "pulse-title", "pulse-heading", "pulse-display", "pulse-hero"],
      radius: ["pulse-control", "pulse-item", "pulse-card", "pulse-sheet"],
      shadow: ["pulse-1", "pulse-2", "pulse-3"],
      font: ["pulse-display", "pulse-text"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Initials for fallback avatars ("Juan dela Cruz" → "JC"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unit]}`;
}
