import { z } from "zod";
import type { AutomodCategory, BadgeKind, Json, Tables } from "@/lib/supabase/database.types";

export type AuditEntry = Tables<"audit_logs">;
export type LfgBeacon = Tables<"lfg_beacons">;
export type SoundboardClip = Tables<"soundboard_clips">;
export type ServerBadge = Tables<"server_badges">;

// ---------------------------------------------------------------------------------------
// Support badges & server boosts
// ---------------------------------------------------------------------------------------

export const BADGES: Record<BadgeKind, { label: string; emoji: string; description: string; className: string }> = {
  booster: { label: "Server Booster", emoji: "🚀", description: "Nag-boost ng tambayan", className: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200" },
  lodi_supporter: { label: "Lodi Supporter", emoji: "🏆", description: "Suportado ang tambayan buwan-buwan", className: "border-sun/50 bg-sun/15 text-sun" },
  gcash_contributor: { label: "Gcash Contributor", emoji: "💙", description: "Nag-ambag via GCash / Maya", className: "border-sky-400/40 bg-sky-500/15 text-sky-200" },
};

export const BADGE_KINDS = Object.keys(BADGES) as BadgeKind[];

/** Boost levels unlock at 2 / 7 / 14 boosters (UI flair only). */
export function boostLevel(boosters: number): { level: 0 | 1 | 2 | 3; next: number | null } {
  if (boosters >= 14) return { level: 3, next: null };
  if (boosters >= 7) return { level: 2, next: 14 };
  if (boosters >= 2) return { level: 1, next: 7 };
  return { level: 0, next: 2 };
}

/** "09171234567" → "0917 123 4567" */
export function formatMobile(number: string) {
  return number.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3");
}

const mobile = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?63/, "0"))
  .pipe(z.string().regex(/^09\d{9}$/, "Dapat 11-digit PH mobile number (09XXXXXXXXX)."));

export const supportSettingsSchema = z.object({
  gcashNumber: z.union([z.literal(""), mobile]).transform((v) => v || null),
  mayaNumber: z.union([z.literal(""), mobile]).transform((v) => v || null),
  supportNote: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(280, "Hanggang 280 characters lang")),
});

// ---------------------------------------------------------------------------------------
// Bantay-Bayan: auto-mod, slow mode
// ---------------------------------------------------------------------------------------

export const AUTOMOD_CATEGORIES: Record<AutomodCategory, { label: string; description: string }> = {
  spam: { label: "Spam & flooding", description: "Paulit-ulit na message, mass mentions, \"free nitro\" at get-rich-quick scams." },
  phishing: { label: "Phishing links", description: "Pekeng GCash/Maya/bank/Discord/Steam links, IP loggers at lookalike domains." },
  hate: { label: "Hate speech", description: "Slurs laban sa lahi, kasarian at kapansanan." },
  explicit: { label: "Explicit content", description: "Porn sites at sexual na salita (English at Tagalog)." },
};

export const AUTOMOD_CATEGORY_KEYS = Object.keys(AUTOMOD_CATEGORIES) as AutomodCategory[];

export const automodSettingsSchema = z.object({
  enabled: z.boolean(),
  categories: z.array(z.enum(["spam", "phishing", "hate", "explicit"])).max(4),
  customTerms: z
    .array(z.string())
    .transform((terms) => Array.from(new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))))
    .pipe(z.array(z.string().min(2, "Min 2 characters bawat salita").max(60, "Hanggang 60 characters bawat salita")).max(100, "Hanggang 100 custom words lang")),
});

/** Parses the custom-terms textarea: one term per line or comma-separated. */
export function parseTermList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export const SLOWMODE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 900, label: "15m" },
  { value: 3600, label: "1h" },
  { value: 21600, label: "6h" },
];

export function formatDuration(seconds: number) {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------------------

export const AUDIT_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Lahat" },
  { value: "member.", label: "Members" },
  { value: "channel.", label: "Channels" },
  { value: "message.", label: "Messages" },
  { value: "automod.", label: "Auto-mod" },
  { value: "server.", label: "Server" },
];

function meta(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * One human line per audit entry, e.g. "Juan banned Troll — spam links".
 * `name` resolves user ids (actor, targets, message authors) to display names.
 */
export function describeAudit(entry: Pick<AuditEntry, "action" | "actor_id" | "target_id" | "metadata">, name: (id: string | null | undefined) => string): string {
  const m = meta(entry.metadata);
  const actor = entry.actor_id ? name(entry.actor_id) : "System";
  const target = name(entry.target_id);
  const str = (v: Json | undefined) => (typeof v === "string" ? v : "");
  switch (entry.action) {
    case "member.join":
      return `${target} joined the tambayan`;
    case "member.leave":
      return `${target} left the tambayan`;
    case "member.kick":
      return `${actor} kicked ${target}`;
    case "member.ban":
      return `${actor} banned ${target}${str(m.reason) ? ` — ${str(m.reason)}` : ""}`;
    case "member.unban":
      return `${actor} unbanned ${target}`;
    case "member.role_update":
      return `${actor} changed ${target}'s role: ${str(m.from)} → ${str(m.to)}`;
    case "channel.create":
      return `${actor} created ${m.type === "voice" ? "🔊" : "#"}${str(m.name)}`;
    case "channel.update": {
      const changed = Array.isArray(m.changed) ? m.changed.join(", ") : "";
      return `${actor} updated #${str(m.name)} (${changed})`;
    }
    case "channel.delete":
      return `${actor} deleted ${m.type === "voice" ? "🔊" : "#"}${str(m.name)}`;
    case "message.delete":
      return `${actor} deleted a message by ${name(str(m.author_id))}`;
    case "message.pin":
      return `${actor} pinned a message`;
    case "message.unpin":
      return `${actor} unpinned a message`;
    case "automod.block":
      return `Bantay-Bayan blocked a message from ${name(str(m.author_id))} (${AUTOMOD_CATEGORIES[str(m.category) as AutomodCategory]?.label ?? "custom words"})`;
    case "server.update": {
      const changed = Array.isArray(m.changed) ? m.changed.join(", ") : "settings";
      return `${actor} updated the tambayan (${changed})`;
    }
    case "server.transfer":
      return `${actor} transferred ownership to ${target}`;
    case "invite.regenerate":
      return `${actor} reset the invite link`;
    case "badge.grant":
      return `${actor} gave ${target} the ${BADGES[str(m.badge) as BadgeKind]?.label ?? "a"} badge`;
    case "badge.revoke":
      return `${actor} removed ${target}'s ${BADGES[str(m.badge) as BadgeKind]?.label ?? ""} badge`;
    case "soundboard.add":
      return `${actor} added the "${str(m.name)}" sound`;
    case "soundboard.remove":
      return `${actor} removed the "${str(m.name)}" sound`;
    case "lfg.close":
      return `${actor} closed an LFG beacon for ${str(m.game)}`;
    default:
      return `${actor}: ${entry.action}`;
  }
}

export function auditExcerpt(entry: Pick<AuditEntry, "metadata">): string | null {
  const excerpt = meta(entry.metadata).excerpt;
  return typeof excerpt === "string" && excerpt ? excerpt : null;
}

// ---------------------------------------------------------------------------------------
// LFG
// ---------------------------------------------------------------------------------------

export const lfgSchema = z.object({
  game: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Anong laro?").max(48, "Hanggang 48 characters lang")),
  description: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(200, "Hanggang 200 characters lang")),
  partySize: z.coerce.number().int().min(2).max(10),
  durationMinutes: z.coerce.number().int().min(15).max(240),
  voiceChannelId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});

export const LFG_GAMES = ["Valorant", "Mobile Legends", "Dota 2", "CODM", "Genshin Impact", "Roblox", "Minecraft", "League of Legends", "Among Us", "Wild Rift"];

/** Beacons disappear from the board once closed or past their expiry. */
export function isBeaconLive(beacon: Pick<LfgBeacon, "status" | "expires_at">, now = Date.now()) {
  return beacon.status !== "closed" && new Date(beacon.expires_at).getTime() > now;
}

export function minutesLeft(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
}

// ---------------------------------------------------------------------------------------
// DB error codes raised by the community migration → friendly Taglish
// ---------------------------------------------------------------------------------------

const COMMUNITY_ERRORS: Record<string, string> = {
  BANNED: "Naka-ban ka sa tambayan na 'to.",
  CANNOT_BAN_MEMBER: "Hindi mo pwedeng i-ban ang member na 'yan.",
  SLOWMODE: "Slow mode — hinay-hinay lang.",
  VERIFICATION_REQUIRED: "I-verify muna ang email o phone number mo bago mag-chat sa channel na 'to.",
  AUTOMOD_BLOCKED: "Na-block ng Bantay-Bayan auto-mod ang message mo.",
  INVALID_THREAD: "Hindi pwedeng mag-thread dito.",
  LFG_FULL: "Puno na ang party!",
  LFG_CLOSED: "Sarado na ang LFG beacon na 'yan.",
  LFG_NOT_FOUND: "Hindi mahanap ang LFG beacon.",
  INVALID_VOICE_CHANNEL: "Pumili ng voice channel sa tambayan na 'to.",
  SOUNDBOARD_FULL: "Hanggang 24 sounds lang bawat tambayan.",
  INVALID_CLIP_PATH: "May problema sa sound file. I-upload ulit.",
  USER_NOT_FOUND: "Walang user na may ganyang username.",
  CANNOT_FRIEND_SELF: "Hindi mo pwedeng i-add ang sarili mo. 😅",
  TOO_MANY_REQUESTS: "Ang dami mo nang pending friend requests.",
  REQUEST_NOT_FOUND: "Wala nang friend request na 'yan.",
  DM_NOT_ALLOWED: "Friends lang ang pwedeng mag-DM sa isa't isa.",
  INVALID_GROUP_SIZE: "Ang group DM ay 3 hanggang 10 tao.",
  RATE_LIMITED: "Dahan-dahan lang, kabayan — masyadong mabilis mag-send.",
};

export function communityError(message: string | undefined | null, fallback = "May nangyaring mali. Subukan ulit."): string {
  if (!message) return fallback;
  const key = Object.keys(COMMUNITY_ERRORS).find((k) => message.includes(k));
  if (key) return COMMUNITY_ERRORS[key];
  if (message.includes("row-level security") || message.includes("permission denied")) return "Wala kang permiso para dito.";
  return fallback;
}
