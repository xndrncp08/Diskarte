"use client";

import { useSyncExternalStore } from "react";

/**
 * Discord's Chat and Accessibility settings, per browser: chat text size, spoilers, inline media,
 * reactions, role colours, 24-hour time, reduced motion and underlined links.
 */
export interface DisplayPrefs {
  /** Chat message text, in px. */
  fontSize: number;
  spoilers: "click" | "always";
  inlineMedia: boolean;
  /** Link previews under messages. */
  embeds: boolean;
  reactions: boolean;
  roleColors: boolean;
  hour24: boolean;
  reducedMotion: "system" | "on";
  underlineLinks: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
  colorMode: "dark" | "light" | "system";
  language: "en" | "fil";
  timeZone: string;
}

export const FONT_SIZES = [12, 14, 15, 16, 18, 20] as const;
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  fontSize: 15,
  spoilers: "click",
  inlineMedia: true,
  embeds: true,
  reactions: true,
  roleColors: true,
  hour24: false,
  reducedMotion: "system",
  underlineLinks: false,
  reducedTransparency: false,
  highContrast: false,
  colorMode: "dark",
  language: "en",
  timeZone: "system",
};

const KEY = "diskarte:display-prefs";
let cached: DisplayPrefs | null = null;
const listeners = new Set<() => void>();
export function validTimeZone(value: unknown): value is string {
  if (value === "system") return true;
  if (typeof value !== "string" || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

export function parseDisplayPrefs(raw: string | null): DisplayPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<DisplayPrefs>) : {};
    const d = DEFAULT_DISPLAY_PREFS;
    return {
      fontSize: (FONT_SIZES as readonly number[]).includes(v.fontSize as number) ? (v.fontSize as number) : d.fontSize,
      spoilers: v.spoilers === "always" ? "always" : "click",
      inlineMedia: v.inlineMedia !== false,
      embeds: v.embeds !== false,
      reactions: v.reactions !== false,
      roleColors: v.roleColors !== false,
      hour24: v.hour24 === true,
      reducedMotion: v.reducedMotion === "on" ? "on" : "system",
      underlineLinks: v.underlineLinks === true,
      reducedTransparency: v.reducedTransparency === true,
      highContrast: v.highContrast === true,
      colorMode: v.colorMode === "light" || v.colorMode === "system" ? v.colorMode : "dark",
      language: v.language === "fil" ? "fil" : "en",
      timeZone: validTimeZone(v.timeZone) ? v.timeZone : "system",
    };
  } catch {
    return DEFAULT_DISPLAY_PREFS;
  }
}

export function readDisplayPrefs(): DisplayPrefs {
  if (cached) return cached;
  try {
    cached = parseDisplayPrefs(localStorage.getItem(KEY));
  } catch {
    cached = DEFAULT_DISPLAY_PREFS;
  }
  return cached;
}

export function setDisplayPrefs(patch: Partial<DisplayPrefs>) {
  cached = { ...readDisplayPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private mode: this session only.
  }
  listeners.forEach((l) => l());
  if (typeof document !== "undefined") {
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `diskarte-mode=${cached.colorMode}; path=/; max-age=31536000; samesite=lax${secure}`;
    document.cookie = `diskarte-language=${cached.language}; path=/; max-age=31536000; samesite=lax${secure}`;
  }
}

export function replaceDisplayPrefs(value: unknown) {
  cached = null;
  setDisplayPrefs(parseDisplayPrefs(JSON.stringify(value)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Server render and hydration use the defaults; the saved prefs apply right after. */
export function useDisplayPrefs() {
  return useSyncExternalStore(subscribe, readDisplayPrefs, () => DEFAULT_DISPLAY_PREFS);
}
