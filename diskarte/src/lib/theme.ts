/**
 * UI themes: each one recolours the accent and the ambient backdrop (CSS in globals.css under
 * html[data-theme=…]). Saved in a cookie so the root layout renders it on <html>: no flash, and no
 * client-only attribute for React to wipe when it re-renders the root.
 */
export const THEMES = [
  { id: "solar", name: "Solar", accent: "#ffb800", base: "#0f172a" },
  { id: "bayan", name: "Bayan", accent: "#60a5fa", base: "#0c1a3a" },
  { id: "neon", name: "Neon", accent: "#22d3ee", base: "#071a22" },
  { id: "ube", name: "Ube", accent: "#c4b5fd", base: "#1a1033" },
  { id: "sampaguita", name: "Sampaguita", accent: "#f9a8d4", base: "#24101d" },
  { id: "kalikasan", name: "Kalikasan", accent: "#4ade80", base: "#0b1f17" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_COOKIE = "diskarte-theme";
const DEFAULT: ThemeId = "solar";
const listeners = new Set<() => void>();

export function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getTheme(): ThemeId {
  const current = typeof document === "undefined" ? null : document.documentElement.dataset.theme;
  return isTheme(current) ? current : DEFAULT;
}

export function setTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
