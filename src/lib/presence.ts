import type { PresenceStatus } from "@/lib/supabase/database.types";
import type { SignalLevel } from "@/components/retro/SignalBars";

/** Payload each client tracks on the private `server:<id>` presence channel. */
export interface PresencePayload {
  user_id: string;
  status: PresenceStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
  voice_channel_id: string | null;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  online_at: string;
}

export type PresenceState = Record<string, PresencePayload[]>;

/** Collapse Supabase presence state (key → metas[]) to one entry per user, newest tab wins. */
export function flattenPresence(state: PresenceState): Map<string, PresencePayload> {
  const out = new Map<string, PresencePayload>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      if (!meta?.user_id) continue;
      const existing = out.get(meta.user_id);
      if (!existing) {
        out.set(meta.user_id, meta);
        continue;
      }
      // Prefer the tab that is in voice, then the most recent.
      const pick =
        (meta.voice_channel_id && !existing.voice_channel_id) ||
        (!!meta.voice_channel_id === !!existing.voice_channel_id && meta.online_at > existing.online_at);
      if (pick) out.set(meta.user_id, meta);
    }
  }
  return out;
}

/** What other members should see: invisible users look offline. */
export function visibleStatus(p: PresencePayload | undefined): PresenceStatus | "offline" {
  if (!p || p.status === "invisible") return "offline";
  return p.status;
}

export type RealtimeHealth = "connecting" | "connected" | "degraded" | "offline";

export function signalLevel(health: RealtimeHealth, online: boolean): SignalLevel {
  if (!online || health === "offline") return 0;
  if (health === "degraded") return 1;
  if (health === "connecting") return 2;
  return 4;
}
