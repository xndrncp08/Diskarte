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

/** The colour a status badge shows: presence, with custom statuses getting their own blue tone. */
export type StatusTone = PresenceStatus | "offline" | "custom";

/** The one custom status that keeps the amber AFK tone instead of the blue custom one. */
const AFK_STATUS = "AFK / Tulog";

/**
 * Badge tone for a status: offline/invisible and Busy (DND) always win; any custom status other than
 * "AFK / Tulog" (e.g. "Nagluto ng Canton") is blue; then Idle amber and Online green.
 */
export function statusTone(status: PresenceStatus | "offline", customStatus?: string | null): StatusTone {
  if (status === "offline" || status === "invisible" || status === "dnd") return status;
  if (customStatus && customStatus !== AFK_STATUS) return "custom";
  return status;
}

export type RealtimeHealth = "connecting" | "connected" | "degraded" | "offline";

export function signalLevel(health: RealtimeHealth, online: boolean): SignalLevel {
  if (!online || health === "offline") return 0;
  if (health === "degraded") return 1;
  if (health === "connecting") return 2;
  return 4;
}
