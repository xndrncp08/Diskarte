import type { GlyphCode } from "@/lib/glyphs";
import type { ZodError } from "zod";
import type { PresenceStatus } from "@/lib/supabase/database.types";

/** Salakot mascot avatars: each preset recolours the bubble, hat band and background. */
export const AVATAR_PRESETS = {
  araw: { label: "Araw", bg: "#FFB800", bubble: "#FFF8EC", band: "#CE1126" },
  dagat: { label: "Dagat", bg: "#0EA5E9", bubble: "#F0F9FF", band: "#0038A8" },
  ube: { label: "Ube", bg: "#7C3AED", bubble: "#F5F3FF", band: "#FFB800" },
  calamansi: { label: "Calamansi", bg: "#84CC16", bubble: "#F7FEE7", band: "#15803D" },
  sampaguita: { label: "Sampaguita", bg: "#F1F5F9", bubble: "#FFFFFF", band: "#16A34A" },
  jeepney: { label: "Jeepney", bg: "#DC2626", bubble: "#FFF7ED", band: "#FFB800" },
  "halo-halo": { label: "Halo-Halo", bg: "#EC4899", bubble: "#FDF2F8", band: "#7C3AED" },
  gabi: { label: "Gabi", bg: "#1E293B", bubble: "#E2E8F0", band: "#FFB800" },
} as const;

export type AvatarPreset = keyof typeof AVATAR_PRESETS;
export const AVATAR_PRESET_KEYS = Object.keys(AVATAR_PRESETS) as AvatarPreset[];

export const BANNER_PRESETS = {
  paglubog: { label: "Paglubog ng Araw", css: "linear-gradient(135deg, #FFB800 0%, #EA580C 45%, #7C2D12 100%)" },
  watawat: { label: "Watawat", css: "linear-gradient(135deg, #0038A8 0%, #0038A8 48%, #CE1126 52%, #CE1126 100%)" },
  "8bit": {
    label: "8-Bit Arcade",
    css: "repeating-conic-gradient(#0F172A 0% 25%, #1E293B 0% 50%) 0 0 / 24px 24px, linear-gradient(#0F172A, #020617)",
  },
  bulkan: { label: "Mayon", css: "linear-gradient(160deg, #0F172A 0%, #334155 40%, #F97316 100%)" },
  palayan: { label: "Palayan", css: "linear-gradient(180deg, #38BDF8 0%, #86EFAC 55%, #15803D 100%)" },
  hatinggabi: { label: "Hatinggabi", css: "radial-gradient(circle at 80% 20%, #FFB80055, transparent 40%), linear-gradient(135deg, #020617, #1E1B4B)" },
} as const;

export type BannerPreset = keyof typeof BANNER_PRESETS;
export const BANNER_PRESET_KEYS = Object.keys(BANNER_PRESETS) as BannerPreset[];

/**
 * Filipino community status triggers. Each one also sets the matching presence, so the badge, ring and
 * roster dot say "Idle" when you're AFK / Tulog instead of staying green "Online".
 */
export const STATUS_TRIGGERS: readonly { glyph: GlyphCode; text: string; status: PresenceStatus }[] = [
  { glyph: ":canton:", text: "Nagluto ng Canton", status: "idle" },
  { glyph: ":afk:", text: "AFK / Tulog", status: "idle" },
  { glyph: ":game:", text: "LFG / Pa-carry", status: "online" },
  { glyph: ":study:", text: "Nag-aaral pa boffum", status: "dnd" },
  { glyph: ":jeep:", text: "Nasa jeep, mahina signal", status: "idle" },
  { glyph: ":kumakain:", text: "Kumakain, brb", status: "idle" },
  { glyph: ":coffee:", text: "Kape muna", status: "idle" },
  { glyph: ":brownout:", text: "Brownout / Bumabagyo", status: "idle" },
];

export const PRESENCE_OPTIONS: { value: PresenceStatus; label: string; hint: string }[] = [
  { value: "online", label: "Online", hint: "G ako!" },
  { value: "idle", label: "Idle", hint: "Saglit lang" },
  { value: "dnd", label: "Do Not Disturb", hint: "Wag muna, busy" },
  { value: "invisible", label: "Invisible", hint: "Stealth mode" },
];

export function resolveAvatarPreset(key: string | null | undefined) {
  return AVATAR_PRESETS[(key ?? "araw") as AvatarPreset] ?? AVATAR_PRESETS.araw;
}

export function resolveBannerCss(key: string | null | undefined) {
  return (BANNER_PRESETS[(key ?? "paglubog") as BannerPreset] ?? BANNER_PRESETS.paglubog).css;
}

// ---------------------------------------------------------------------------------------
// Validation (shared by the client form and the server action)
// ---------------------------------------------------------------------------------------

/** Strip ASCII control characters (keeps newlines out of single-line fields). */
export function stripControl(value: string, allowNewlines = false) {
  const pattern = allowNewlines ? /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(pattern, "");
}

/** Hosts OAuth providers serve avatars from (mirrors img-src in the CSP). */
export const OAUTH_AVATAR_HOSTS = ["avatars.githubusercontent.com", "lh3.googleusercontent.com", "cdn.discordapp.com"];

export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (OAUTH_AVATAR_HOSTS.includes(url.hostname)) return true;
    return url.pathname.startsWith("/storage/v1/object/public/avatars/");
  } catch {
    return false;
  }
}

export const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 10, label: "10+ characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "uppercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "special character" },
] as const;

export const PASSWORD_MISMATCH = "Passwords don't match";

export const OAUTH_PROVIDERS = ["github", "google", "discord"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function enabledOAuthProviders(raw = process.env.AUTH_OAUTH_PROVIDERS): OAuthProvider[] {
  if (raw === undefined) return ["github", "google"];
  return raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p));
}

/** Flatten zod issues into `{ field: firstMessage }`. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
