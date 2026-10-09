import { z } from "zod";
import type { PresenceStatus } from "@/lib/supabase/database.types";

/**
 * Shared vocabulary of the Super Admin Control Center: platform roles, broadcast options, the
 * network roster's shape and the pure filtering / presence logic the inspector runs on the client.
 */

/** Diskarte HQ and its two broadcast channels (fixed ids, seeded by migration 20261005000000). */
export const HQ_SERVER_ID = "d15ca47e-0000-4000-8000-000000000001";
export const HQ_CHANNELS = {
  announcements: "d15ca47e-0000-4000-8000-0000000000a1",
  "global-lounge": "d15ca47e-0000-4000-8000-0000000000a2",
} as const;

export const PLATFORM_ROLES = ["super_admin", "moderator", "member"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = { super_admin: "Super Admin", moderator: "Moderator", member: "Standard Member" };

export const BROADCAST_TONES = ["info", "success", "warning", "critical"] as const;
export type BroadcastTone = (typeof BROADCAST_TONES)[number];
export const BROADCAST_TONE_LABEL: Record<BroadcastTone, string> = { info: "Info", success: "Success", warning: "Warning", critical: "Critical" };

export const BROADCAST_TARGETS = ["announcements", "global-lounge"] as const;
export type BroadcastTarget = (typeof BROADCAST_TARGETS)[number];

/** Sticky banner lifetimes offered by the composer (null = until taken down). */
export const STICKY_DURATIONS: { hours: number | null; label: string }[] = [
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
  { hours: null, label: "Until taken down" },
];

/** Ban lengths offered by the inspector (null = permanent). */
export const BAN_DURATIONS: { hours: number | null; label: string }[] = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
  { hours: null, label: "Permanent" },
];

export const TITLE_MAX = 120;
export const BODY_MAX = 3500;

export const broadcastSchema = z.object({
  title: z.string().trim().min(1, "Give the announcement a title").max(TITLE_MAX, `Keep the title under ${TITLE_MAX} characters`),
  body: z.string().trim().min(1, "Write something to broadcast").max(BODY_MAX, `Keep it under ${BODY_MAX} characters`),
  tone: z.enum(BROADCAST_TONES),
  targets: z.array(z.enum(BROADCAST_TARGETS)).min(1, "Pick at least one channel").max(2),
  sticky: z.boolean(),
  stickyHours: z.number().int().min(1).max(720).nullable(),
});
export type BroadcastInput = z.infer<typeof broadcastSchema>;

export const roleChangeSchema = z.object({ userId: z.uuid(), role: z.enum(PLATFORM_ROLES) });
export const statusOverrideSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["online", "idle", "dnd", "invisible"]),
  customStatus: z.string().trim().max(64, "Keep it under 64 characters").nullable(),
});
export const banSchema = z.object({
  userId: z.uuid(),
  hours: z.number().int().min(1).max(8760).nullable(),
  reason: z.string().trim().max(300, "Keep the reason under 300 characters"),
});
export const userIdSchema = z.object({ userId: z.uuid() });
export const broadcastIdSchema = z.object({ broadcastId: z.uuid() });

// ---- snapshot shapes ---------------------------------------------------------------------------

export interface AdminDevice {
  device_id: string;
  fingerprint: string;
  label: string;
  status: PresenceStatus;
  custom_status: string | null;
  voice_channel_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  avatar_preset: string;
  avatar_url: string | null;
  status: PresenceStatus;
  custom_status: string | null;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  role: PlatformRole;
  banned_until: string | null;
  ban_reason: string | null;
  sessions: number;
  last_seen_at: string | null;
  devices: AdminDevice[];
}

export interface AdminOverview {
  users: number;
  online: number;
  in_voice: number;
  banned: number;
  super_admins: number;
  moderators: number;
  broadcasts: number;
  last7: { day: string; count: number }[];
}

export interface VoiceParticipant {
  identity: string;
  name: string;
  joinedAt: string | null;
  micLive: boolean;
  camera: boolean;
  screen: boolean;
}

export interface VoiceRoom {
  room: string;
  kind: "voice" | "dm" | "other";
  channelId: string | null;
  label: string;
  participants: VoiceParticipant[];
}

export interface VoiceTelemetry {
  configured: boolean;
  error: string | null;
  rooms: VoiceRoom[];
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Broadcast {
  id: string;
  author_id: string | null;
  title: string;
  body: string;
  tone: BroadcastTone;
  targets: BroadcastTarget[];
  message_ids: string[];
  sticky: boolean;
  sticky_until: string | null;
  retracted_at: string | null;
  created_at: string;
}

export interface AdminSnapshot {
  overview: AdminOverview;
  users: AdminUser[];
  voice: VoiceTelemetry;
  audit: AuditEntry[];
  broadcasts: Broadcast[];
  generatedAt: string;
}

// ---- presence ------------------------------------------------------------------------------

/** A device that hasn't checked in for this long is offline (heartbeats run every 30 s). */
export const ONLINE_WINDOW_MS = 2 * 60_000;

export const PRESENCE_STATES = ["online", "afk", "canton", "busy", "offline"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];
export const PRESENCE_LABEL: Record<PresenceState, string> = {
  online: "Online",
  afk: "AFK / Tulog",
  canton: "Nagluto ng Canton",
  busy: "Busy",
  offline: "Offline",
};

/** Devices that checked in recently enough to count as connected. */
export function liveDevices(user: Pick<AdminUser, "devices">, now: number): AdminDevice[] {
  return user.devices.filter((d) => now - Date.parse(d.last_seen_at) < ONLINE_WINDOW_MS);
}

/**
 * What the inspector shows for someone: the freshest live device's status mapped onto the five
 * network states. Admins see through Invisible (it reads as Online, flagged separately).
 */
export function presenceOf(user: Pick<AdminUser, "devices">, now: number): { state: PresenceState; invisible: boolean; voiceChannelId: string | null } {
  const live = liveDevices(user, now).sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at));
  const d = live[0];
  if (!d) return { state: "offline", invisible: false, voiceChannelId: null };
  const voiceChannelId = live.find((x) => x.voice_channel_id)?.voice_channel_id ?? null;
  const custom = d.custom_status?.trim().toLowerCase() ?? "";
  let state: PresenceState = "online";
  if (d.status === "dnd") state = "busy";
  else if (custom.includes("canton")) state = "canton";
  else if (custom.startsWith("afk") || d.status === "idle") state = "afk";
  return { state, invisible: d.status === "invisible", voiceChannelId };
}

export function isBanned(user: Pick<AdminUser, "banned_until">, now: number) {
  if (!user.banned_until) return false;
  return user.banned_until === "infinity" || Date.parse(user.banned_until) > now;
}

export type AccountFilter = "all" | "active" | "banned";
export type ChannelFilter = "any" | "voice" | "none" | string;

export interface RosterFilters {
  query: string;
  presence: PresenceState | "all";
  role: PlatformRole | "all";
  account: AccountFilter;
  /** "any", "voice" (in any voice channel or LiveKit room), "none", or one channel id. */
  channel: ChannelFilter;
}

export const DEFAULT_FILTERS: RosterFilters = { query: "", presence: "all", role: "all", account: "all", channel: "any" };

/** Client-side roster filtering: instant on every keystroke; the server search narrows big networks. */
export function filterUsers(users: AdminUser[], f: RosterFilters, now: number, inLiveKit: ReadonlySet<string> = new Set()): AdminUser[] {
  const q = f.query.trim().toLowerCase().replace(/^@/, "");
  return users.filter((u) => {
    if (q && !(u.username.includes(q) || u.display_name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))) return false;
    if (f.role !== "all" && u.role !== f.role) return false;
    const banned = isBanned(u, now);
    if (f.account === "banned" && !banned) return false;
    if (f.account === "active" && banned) return false;
    const p = presenceOf(u, now);
    if (f.presence !== "all" && p.state !== f.presence) return false;
    const inVoice = !!p.voiceChannelId || inLiveKit.has(u.id);
    if (f.channel === "voice" && !inVoice) return false;
    if (f.channel === "none" && inVoice) return false;
    if (f.channel !== "any" && f.channel !== "voice" && f.channel !== "none" && p.voiceChannelId !== f.channel) return false;
    return true;
  });
}

/** Composes the posted message exactly as the database does (title as a header, then the body). */
export function broadcastMarkdown(title: string, body: string) {
  return `## ${title.trim()}\n\n${body.trim()}`;
}

/** Whether a broadcast's sticky banner should show right now. */
export function isStickyLive(b: Pick<Broadcast, "sticky" | "sticky_until" | "retracted_at">, now: number) {
  return b.sticky && !b.retracted_at && (!b.sticky_until || Date.parse(b.sticky_until) > now);
}

const ADMIN_ERRORS: Record<string, string> = {
  NOT_AUTHORIZED: "Only super admins can do that.",
  CANNOT_CHANGE_OWN_ROLE: "You can't change your own role — ask another super admin.",
  CANNOT_REVOKE_OWN_SESSIONS: "Sign out from your own settings instead.",
  CANNOT_BAN_SELF: "You can't ban yourself.",
  CANNOT_BAN_SUPER_ADMIN: "Demote a super admin before banning them.",
  USER_NOT_FOUND: "That account no longer exists.",
  INVALID_ROLE: "Unknown role.",
  INVALID_BAN_DURATION: "Pick a ban length between 1 hour and 1 year.",
  INVALID_STICKY_DURATION: "Sticky banners last up to 30 days.",
  INVALID_TITLE: "Give the announcement a title.",
  INVALID_BODY: "Write something to broadcast.",
  INVALID_TARGETS: "Pick #announcements, #global-lounge or both.",
  BROADCAST_NOT_FOUND: "That banner is already down.",
  CHANNEL_MISSING: "Diskarte HQ is missing that channel.",
  RATE_LIMITED: "Slow down a little. Try again in a moment.",
};

/** Friendly text for a database error raised by the Control Center RPCs. */
export function adminError(message: string | null | undefined, fallback = "Something went wrong. Try again."): string {
  if (!message) return fallback;
  const code = Object.keys(ADMIN_ERRORS).find((k) => message.includes(k));
  return code ? ADMIN_ERRORS[code] : fallback;
}

const ACTION_LABEL: Record<string, string> = {
  "user.role_update": "Changed role",
  "user.status_override": "Overrode status",
  "user.sessions_revoke": "Revoked sessions",
  "user.ban": "Banned",
  "user.unban": "Unbanned",
  "broadcast.dispatch": "Broadcast",
  "broadcast.retract": "Took down banner",
  "waitlist.archived": "Archived waitlist application",
};

export function auditLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}
