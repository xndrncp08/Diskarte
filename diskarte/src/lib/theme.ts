/**
 * UI themes: each one recolours the accent and the ambient backdrop (CSS in globals.css under
 * html[data-theme=…]). Saved per browser and applied before first paint by THEME_BOOT_SCRIPT.
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

const STORAGE_KEY = "diskarte:theme";
const DEFAULT: ThemeId = "solar";
const listeners = new Set<() => void>();

function isTheme(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

export function getTheme(): ThemeId {
  const current = typeof document === "undefined" ? null : document.documentElement.dataset.theme;
  return isTheme(current) ? current : DEFAULT;
}

export function setTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode: keep it for this session only.
  }
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Inline <head> script: sets data-theme from storage before the first paint, so there's no flash. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(${JSON.stringify(THEMES.map((t) => t.id))}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;
