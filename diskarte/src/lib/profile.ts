import { z } from "zod";
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
export const STATUS_TRIGGERS: readonly { emoji: string; text: string; status: PresenceStatus }[] = [
  { emoji: "🍜", text: "Nagluto ng Canton", status: "idle" },
  { emoji: "😴", text: "AFK / Tulog", status: "idle" },
  { emoji: "🎮", text: "LFG / Pa-carry", status: "online" },
  { emoji: "📚", text: "Nag-aaral pa boffum", status: "dnd" },
  { emoji: "🚌", text: "Nasa jeep, mahina signal", status: "idle" },
  { emoji: "🍚", text: "Kumakain, brb", status: "idle" },
  { emoji: "☕", text: "Kape muna", status: "idle" },
  { emoji: "🌧️", text: "Brownout / Bumabagyo", status: "idle" },
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

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,32}$/, "3–32 characters: letters, numbers, underscores or periods only.");

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

const imageUrl = z
  .string()
  .trim()
  .max(1024)
  .refine((v) => v === "" || isAllowedImageUrl(v), "Invalid image URL")
  .transform((v) => (v === "" ? null : v));

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  displayName: z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().min(1, "What should we call you?").max(32, "32 characters max")),
  bio: z
    .string()
    .transform((v) => stripControl(v, true).trim())
    .pipe(z.string().max(190, "Bio is 190 characters max")),
  avatarPreset: z.enum(AVATAR_PRESET_KEYS as [AvatarPreset, ...AvatarPreset[]]),
  bannerPreset: z.enum(BANNER_PRESET_KEYS as [BannerPreset, ...BannerPreset[]]),
  avatarUrl: imageUrl.nullable().optional(),
  bannerUrl: imageUrl.nullable().optional(),
  status: z.enum(["online", "idle", "dnd", "invisible"]),
  customStatus: z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().max(64, "64 characters max"))
    .transform((v) => (v === "" ? null : v)),
  customStatusEmoji: z
    .string()
    .trim()
    .max(16)
    .transform((v) => (v === "" ? null : v)),
});

export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;
export type ProfileUpdate = z.output<typeof profileUpdateSchema>;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("That email doesn't look right"));

export const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 10, label: "10+ characters" },
  { test: (v: string) => /[a-z]/.test(v), label: "lowercase letter" },
  { test: (v: string) => /[A-Z]/.test(v), label: "uppercase letter" },
  { test: (v: string) => /[0-9]/.test(v), label: "number" },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v), label: "special character" },
] as const;

/** Strong password policy for new/changed passwords (bcrypt only reads the first 72 bytes). */
export const passwordSchema = z
  .string()
  .max(72, "72 characters max")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "That password is too long")
  .superRefine((value, ctx) => {
    const missing = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) => r.label);
    if (missing.length) ctx.addIssue({ code: "custom", message: `Password needs: ${missing.join(", ")}.` });
  });

/** Sign-in only checks shape — policy is enforced when passwords are set, never revealed on login. */
export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(72, "72 characters max"),
});

export const PASSWORD_MISMATCH = "Passwords don't match";

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    username: usernameSchema,
    displayName: z
      .string()
      .transform((v) => stripControl(v).trim())
      .pipe(z.string().min(1, "What should we call you?").max(32)),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: PASSWORD_MISMATCH });

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
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
