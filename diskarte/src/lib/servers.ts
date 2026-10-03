import { z } from "zod";
import type { ChannelType, MemberRole, Tables } from "@/lib/supabase/database.types";
import { stripControl } from "@/lib/profile";

export type Server = Tables<"servers">;
export type Channel = Tables<"channels">;
export type Profile = Tables<"profiles">;
export type MemberWithProfile = Tables<"members"> & { profile: Profile };

export const ROLE_RANK: Record<MemberRole, number> = { member: 0, moderator: 1, admin: 2 };
export const ROLE_LABEL: Record<MemberRole, string> = { admin: "Admin", moderator: "Moderator", member: "Member" };

export function hasRole(role: MemberRole | null | undefined, min: MemberRole) {
  return role ? ROLE_RANK[role] >= ROLE_RANK[min] : false;
}

/** Mirrors the members_guard / members_delete_guard triggers so the UI only offers allowed actions. */
export function canManageMember(opts: { actorRole: MemberRole | null; actorId: string; target: { role: MemberRole; user_id: string }; ownerId: string | null }) {
  const { actorRole, actorId, target, ownerId } = opts;
  const isSelf = target.user_id === actorId;
  const targetIsOwner = target.user_id === ownerId;
  const actorIsOwner = actorId === ownerId;
  return {
    changeRole: actorRole === "admin" && !isSelf && !targetIsOwner && (target.role !== "admin" || actorIsOwner),
    kick: !isSelf && !targetIsOwner && hasRole(actorRole, "moderator") && (ROLE_RANK[target.role] < ROLE_RANK[actorRole ?? "member"] || actorIsOwner),
  };
}

// ---------------------------------------------------------------------------------------
// Names & invites
// ---------------------------------------------------------------------------------------

/** "LFG Valorant!!" → "lfg-valorant" (matches the channels_name_format constraint). */
export function slugifyChannelName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+/, "")
    .slice(0, 32);
}

const INVITE_RE = /^[A-HJ-NP-Z2-9]{10}$/;

/** Accepts a bare code or any URL ending in /invite/<code>; returns the normalised code or null. */
export function parseInviteInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  const match = trimmed.match(/\/invite\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
  if (match) candidate = match[1];
  candidate = candidate.toUpperCase();
  return INVITE_RE.test(candidate) ? candidate : null;
}

export function inviteUrl(siteUrl: string, code: string) {
  return `${siteUrl.replace(/\/$/, "")}/invite/${code}`;
}

export function serverInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 3)
    .map((w) => Array.from(w)[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------

const cleanLine = (max: number, min = 0, message?: string) =>
  z
    .string()
    .transform((v) => stripControl(v).trim())
    .pipe(z.string().min(min, message ?? `At least ${min} characters`).max(max, `${max} characters max`));

export const serverSchema = z.object({
  name: cleanLine(64, 2, "Server names must be 2–64 characters"),
  description: z
    .string()
    .transform((v) => stripControl(v, true).trim())
    .pipe(z.string().max(280, "280 characters max")),
});

export const channelSchema = z
  .object({
    name: z.string(),
    type: z.enum(["text", "voice"]),
    category: cleanLine(32, 1, "Choose a category"),
    topic: cleanLine(256),
  })
  .transform((v, ctx) => {
    const name = v.type === "text" ? slugifyChannelName(v.name) : stripControl(v.name).trim().slice(0, 32);
    if (!name) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Give the channel a name" });
      return z.NEVER;
    }
    return { ...v, name, type: v.type as ChannelType };
  });

export const uuidSchema = z.uuid();

/** Group channels by category preserving position order (categories ordered by first channel). */
export function groupChannels(channels: Channel[]): { category: string; channels: Channel[] }[] {
  const sorted = [...channels].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, Channel[]>();
  for (const channel of sorted) {
    const list = groups.get(channel.category) ?? [];
    list.push(channel);
    groups.set(channel.category, list);
  }
  return Array.from(groups, ([category, list]) => ({ category, channels: list }));
}

export function firstTextChannel(channels: Channel[]): Channel | undefined {
  return groupChannels(channels)
    .flatMap((g) => g.channels)
    .find((c) => c.type === "text");
}
