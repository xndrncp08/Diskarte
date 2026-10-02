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
  booster: { label: "Server Booster", emoji: "🚀", description: "Boosted the server", className: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200" },
  lodi_supporter: { label: "Lodi Supporter", emoji: "🏆", description: "Supports the server monthly", className: "border-sun/50 bg-sun/15 text-sun" },
  gcash_contributor: { label: "Gcash Contributor", emoji: "💙", description: "Donated via GCash / Maya", className: "border-sky-400/40 bg-sky-500/15 text-sky-200" },
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
    .pipe(z.string().max(280, "280 characters max")),
});

// ---------------------------------------------------------------------------------------
// Bantay-Bayan: auto-mod, slow mode
// ---------------------------------------------------------------------------------------

export const AUTOMOD_CATEGORIES: Record<AutomodCategory, { label: string; description: string }> = {
  spam: { label: "Spam & flooding", description: "Repeated messages, mass mentions, \"free nitro\" and get-rich-quick scams." },
  phishing: { label: "Phishing links", description: "Pekeng GCash/Maya/bank/Discord/Steam links, IP loggers at lookalike domains." },
  hate: { label: "Hate speech", description: "Slurs targeting race, gender and disability." },
  explicit: { label: "Explicit content", description: "Porn sites and sexual terms (English and Tagalog)." },
};

export const AUTOMOD_CATEGORY_KEYS = Object.keys(AUTOMOD_CATEGORIES) as AutomodCategory[];

export const automodSettingsSchema = z.object({
  enabled: z.boolean(),
  categories: z.array(z.enum(["spam", "phishing", "hate", "explicit"])).max(4),
  customTerms: z
    .array(z.string())
    .transform((terms) => Array.from(new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))))
    .pipe(z.array(z.string().min(2, "Min 2 characters bawat salita").max(60, "Hanggang 60 characters bawat salita")).max(100, "Up to 100 custom words")),
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
  { value: "", label: "All" },
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
      return `${target} joined the server`;
    case "member.leave":
      return `${target} left the server`;
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
      return `${actor} updated the server (${changed})`;
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
    .pipe(z.string().min(1, "Anong laro?").max(48, "48 characters max")),
  description: z
    .string()
    .transform((v) => v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(200, "200 characters max")),
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
  BANNED: "You're banned from this server.",
  CANNOT_BAN_MEMBER: "You can't ban that member.",
  SLOWMODE: "Slow mode is on — take it easy.",
  VERIFICATION_REQUIRED: "Verify your email or phone number before chatting in this channel.",
  AUTOMOD_BLOCKED: "Bantay-Bayan auto-mod blocked your message.",
  INVALID_THREAD: "Threads aren't allowed here.",
  LFG_FULL: "The party is full!",
  LFG_CLOSED: "That LFG beacon is closed.",
  LFG_NOT_FOUND: "Couldn't find that LFG beacon.",
  INVALID_VOICE_CHANNEL: "Pick a voice channel in this server.",
  SOUNDBOARD_FULL: "Up to 24 sounds per server.",
  INVALID_CLIP_PATH: "Something's wrong with the sound file. Upload it again.",
  USER_NOT_FOUND: "No user has that username.",
  CANNOT_FRIEND_SELF: "You can't add yourself. 😅",
  TOO_MANY_REQUESTS: "You have too many pending friend requests.",
  REQUEST_NOT_FOUND: "That friend request no longer exists.",
  DM_NOT_ALLOWED: "Only friends can DM each other.",
  INVALID_GROUP_SIZE: "Group DMs have 3 to 10 people.",
  RATE_LIMITED: "Slow down — you're sending too fast.",
};

export function communityError(message: string | undefined | null, fallback = "Something went wrong. Try again."): string {
  if (!message) return fallback;
  const key = Object.keys(COMMUNITY_ERRORS).find((k) => message.includes(k));
  if (key) return COMMUNITY_ERRORS[key];
  if (message.includes("row-level security") || message.includes("permission denied")) return "You don't have permission for this.";
  return fallback;
}
