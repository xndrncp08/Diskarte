/**
 * Muted channels (Discord's "Mute Channel") and the server menu's "Hide Muted Channels", per server,
 * remembered in this browser. Muted channels are dimmed in the sidebar, or hidden when that's on.
 */
import { readNotifyPrefs, setNotifyPrefs, subscribeNotifyPrefs } from "./notify-prefs";
const KEY = "diskarte:channel-mute";
const listeners = new Set<() => void>();
type Saved = Record<string, { muted?: string[]; hide?: boolean }>;

export function readChannelMutes(): string {
  try {
    const all = parse(localStorage.getItem(KEY) ?? "{}");
    for (const [id, setting] of Object.entries(readNotifyPrefs().channels ?? {})) {
      if (!setting.serverId) continue;
      const s = all[setting.serverId] ?? {};
      const muted = new Set(s.muted ?? []);
      if (setting.muted && (setting.muteUntil === undefined || setting.muteUntil > Date.now())) muted.add(id); else muted.delete(id);
      all[setting.serverId] = { ...s, muted: [...muted] };
    }
    return JSON.stringify(all);
  } catch {
    return "{}";
  }
}

function parse(snapshot: string): Saved {
  try {
    const v = JSON.parse(snapshot) as unknown;
    return v && typeof v === "object" ? (v as Saved) : {};
  } catch {
    return {};
  }
}

export function serverMutes(snapshot: string, serverId: string): { muted: ReadonlySet<string>; hide: boolean } {
  const s = parse(snapshot)[serverId];
  return { muted: new Set(Array.isArray(s?.muted) ? s.muted.filter((id) => typeof id === "string") : []), hide: s?.hide === true };
}

function write(serverId: string, change: (current: { muted: Set<string>; hide: boolean }) => void) {
  const all = parse(readChannelMutes());
  const current = { muted: new Set(serverMutes(readChannelMutes(), serverId).muted), hide: all[serverId]?.hide === true };
  change(current);
  all[serverId] = { muted: [...current.muted], hide: current.hide };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

export function toggleChannelMute(serverId: string, channelId: string) {
  const muted = !serverMutes(readChannelMutes(), serverId).muted.has(channelId);
  write(serverId, (c) => (c.muted.has(channelId) ? c.muted.delete(channelId) : c.muted.add(channelId)));
  // Store the new value explicitly so another device can also unmute a legacy local channel.
  setNotifyPrefs({ channels: { ...readNotifyPrefs().channels, [channelId]: { muted, serverId } } });
}

export function toggleHideMuted(serverId: string) {
  write(serverId, (c) => (c.hide = !c.hide));
}

export function subscribeChannelMutes(listener: () => void) {
  listeners.add(listener);
  const off = subscribeNotifyPrefs(listener);
  return () => {
    listeners.delete(listener);
    off();
  };
}

/** Preserve existing device mutes when enabling cross-device server delivery. */
export function syncChannelMutes() {
  const channels = { ...readNotifyPrefs().channels };
  for (const [serverId, s] of Object.entries(parse(readChannelMutes()))) for (const id of s.muted ?? []) channels[id] ??= { muted: true, serverId };
  setNotifyPrefs({ channels });
}
