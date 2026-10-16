/**
 * Notification settings (Discord's), per browser: desktop alerts on or off, DM alerts, and per server
 * a level (@mentions only, or nothing) and a mute, which also hides the server's unread pill.
 */
import { trackShownNotification } from "@/lib/read-receipts";

export type NotifyLevel = "mentions" | "nothing";
export const PUSH_KINDS = ["dm", "mention", "reply", "friend", "invitation", "call", "event", "moderation", "security"] as const;
export type PushKind = typeof PUSH_KINDS[number];
export interface PushPrefs { enabled: boolean; previews: boolean; sound: boolean; timeZone: string; events: Record<PushKind, boolean> }
export const DEFAULT_PUSH_PREFS: PushPrefs = { enabled: false, previews: false, sound: true, timeZone: "UTC", events: Object.fromEntries(PUSH_KINDS.map((key) => [key, true])) as Record<PushKind, boolean> };

export interface NotifyPrefs {
  desktop: boolean;
  dms: boolean;
  servers: Record<string, { level?: NotifyLevel; muted?: boolean; muteUntil?: number }>;
  quietHours?: { enabled: boolean; start: number; end: number };
  doNotDisturbUntil?: number;
  push?: PushPrefs;
  channels?: Record<string, { muted: boolean; muteUntil?: number; serverId?: string }>;
}

const KEY = "diskarte:notify-prefs";
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { desktop: false, dms: true, servers: {} };

let cached: NotifyPrefs | null = null;
const listeners = new Set<() => void>();

export function parseNotifyPrefs(raw: string | null): NotifyPrefs {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<NotifyPrefs>) : {};
    const servers: NotifyPrefs["servers"] = {};
    for (const [id, s] of Object.entries(v.servers ?? {})) {
      servers[id] = { level: s?.level === "nothing" ? "nothing" : "mentions", muted: s?.muted === true, ...(typeof s?.muteUntil === "number" && Number.isFinite(s.muteUntil) ? { muteUntil: s.muteUntil } : {}) };
    }
    const quiet = v.quietHours;
    const valid = quiet && Number.isInteger(quiet.start) && quiet.start >= 0 && quiet.start < 1440 && Number.isInteger(quiet.end) && quiet.end >= 0 && quiet.end < 1440;
    const push = v.push;
    let timeZone = "UTC";
    try { if (typeof push?.timeZone === "string") { new Intl.DateTimeFormat("en", { timeZone: push.timeZone }); timeZone = push.timeZone; } } catch { /* invalid time zones use UTC */ }
    const channels: NonNullable<NotifyPrefs["channels"]> = {};
    for (const [id, setting] of Object.entries(v.channels ?? {})) channels[id] = { muted: setting?.muted === true, ...(typeof setting?.muteUntil === "number" && Number.isFinite(setting.muteUntil) ? { muteUntil: setting.muteUntil } : {}), ...(typeof setting?.serverId === "string" ? { serverId: setting.serverId } : {}) };
    return { desktop: v.desktop === true, dms: v.dms !== false, servers, ...(v.channels ? { channels } : {}),
      ...(push ? { push: { enabled: push.enabled === true, previews: push.previews === true, sound: push.sound !== false, timeZone, events: Object.fromEntries(PUSH_KINDS.map((key) => [key, push.events?.[key] !== false])) as PushPrefs["events"] } } : {}),
      ...(valid ? { quietHours: { enabled: quiet.enabled === true, start: quiet.start, end: quiet.end } } : {}),
      ...(typeof v.doNotDisturbUntil === "number" && Number.isFinite(v.doNotDisturbUntil) ? { doNotDisturbUntil: v.doNotDisturbUntil } : {}),
    };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

export function readNotifyPrefs(): NotifyPrefs {
  if (cached) return cached;
  try {
    cached = parseNotifyPrefs(localStorage.getItem(KEY));
  } catch {
    cached = DEFAULT_NOTIFY_PREFS;
  }
  return cached;
}

function save(next: NotifyPrefs) {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode: this session only.
  }
  listeners.forEach((l) => l());
}

export function replaceNotifyPrefs(value: unknown) { save(parseNotifyPrefs(JSON.stringify(value))); }

export function setNotifyPrefs(patch: Partial<Omit<NotifyPrefs, "servers">>) {
  save({ ...readNotifyPrefs(), ...patch });
}

export function setServerNotify(serverId: string, patch: { level?: NotifyLevel; muted?: boolean; muteUntil?: number }) {
  const prefs = readNotifyPrefs();
  save({ ...prefs, servers: { ...prefs.servers, [serverId]: { ...prefs.servers[serverId], ...patch } } });
}

export function serverNotify(prefs: NotifyPrefs, serverId: string, now = Date.now()): { level: NotifyLevel; muted: boolean } {
  const s = prefs.servers[serverId];
  return { level: s?.level ?? "mentions", muted: s?.muted === true && (s.muteUntil === undefined || s.muteUntil > now) };
}

/** Device-local quiet hours follow local time, including daylight-saving changes. */
export function notificationsQuiet(prefs = readNotifyPrefs(), now = new Date()) {
  if ((prefs.doNotDisturbUntil ?? 0) > now.getTime()) return true;
  const q = prefs.quietHours;
  if (!q?.enabled) return false;
  const parts = prefs.push?.timeZone ? new Intl.DateTimeFormat("en-GB", { timeZone: prefs.push.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now) : null;
  const minute = parts ? Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value) : now.getHours() * 60 + now.getMinutes();
  return q.start === q.end || (q.start < q.end ? minute >= q.start && minute < q.end : minute >= q.start || minute < q.end);
}

export function subscribeNotifyPrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetNotifyPrefsCache() {
  cached = null;
}

/**
 * Show a desktop notification if it's switched on and allowed, and you're not already looking at the
 * place it's about. Clicking it brings the tab forward and opens `href`.
 */
export function desktopNotify(opts: { title: string; body: string; tag: string; href: string; open: (href: string) => void }) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (!readNotifyPrefs().desktop || notificationsQuiet() || Notification.permission !== "granted") return;
  // The operating-system push already covers this device, including when a page is foregrounded.
  if (readNotifyPrefs().push?.enabled && localStorage.getItem("diskarte:push-active") === "true") return;
  if (document.hasFocus() && window.location.pathname === opts.href) return;
  let n: Notification;
  try { n = new Notification(opts.title, { body: opts.body.slice(0, 180), tag: opts.tag, icon: "/icons/icon-192.png" }); }
  catch { return; }
  // Reading the conversation closes it (see read-receipts.closeNotifications).
  trackShownNotification(opts.tag, n);
  n.onclick = () => {
    window.focus();
    opts.open(opts.href);
    n.close();
  };
}
