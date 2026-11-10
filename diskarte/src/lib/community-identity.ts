import { hasRole } from "@/lib/servers";
import type { MemberRole } from "@/lib/supabase/database.types";

/** Text on a community accent: white when it reaches 4.5:1, otherwise near-black (the rule migration 20261109010000 checks). */
export const ON_ACCENT_LIGHT = "#ffffff";
export const ON_ACCENT_DARK = "#121016";

const HEX = /^#[0-9a-f]{6}$/i;
const luminance = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);

/** The accent and its readable text colour, or null when unset or malformed (columns are absent before the migration). */
export function communityAccent(accent: string | null | undefined): { background: string; color: string } | null {
  if (!accent || !HEX.test(accent)) return null;
  return { background: accent.toLowerCase(), color: 1.05 / (luminance(accent) + 0.05) >= 4.5 ? ON_ACCENT_LIGHT : ON_ACCENT_DARK };
}

/**
 * The banner URL only when it is a public object in this project's avatars bucket (where the banner upload puts it).
 * Anything else is ignored: an arbitrary https host could log who views the page.
 */
export function communityBanner(url: string | null | undefined, supabaseUrl: string | null | undefined): string | null {
  if (!url || !supabaseUrl) return null;
  try {
    const base = new URL(supabaseUrl);
    const src = new URL(url);
    const ok = src.protocol === base.protocol && src.host === base.host && src.pathname.startsWith("/storage/v1/object/public/avatars/") && !/\.\.|%2e%2e/i.test(url) && !src.username && !src.password;
    return ok ? src.href : null;
  } catch {
    return null;
  }
}

export type LandingTile = "rooms" | "events" | "rules" | "members" | "workspace" | "boards" | "invite" | "requests";

/** Which landing tiles this member sees. Moderator-only tiles (join requests) need moderator; Diskarte HQ has no invite. */
export function landingTiles({ myRole, isSystem, joinApproval }: { myRole: MemberRole; isSystem: boolean; joinApproval: boolean }): LandingTile[] {
  const tiles: LandingTile[] = ["rooms", "events", "rules", "members", "workspace", "boards"];
  if (!isSystem) tiles.push("invite");
  if (joinApproval && hasRole(myRole, "moderator")) tiles.push("requests");
  return tiles;
}
