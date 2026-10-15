/**
 * Notification settings (Discord's), per browser: desktop alerts on or off, DM alerts, and per server
 * a level (@mentions only, or nothing) and a mute, which also hides the server's unread pill.
 */
export type NotifyLevel = "mentions" | "nothing";

export interface NotifyPrefs {
  desktop: boolean;
  dms: boolean;
  servers: Record<string, { level?: NotifyLevel; muted?: boolean; muteUntil?: number }>;
  quietHours?: { enabled: boolean; start: number; end: number };
  doNotDisturbUntil?: number;
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
    return { desktop: v.desktop === true, dms: v.dms !== false, servers,
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

export function serverNotify(prefs: NotifyPrefs, serverId: string): { level: NotifyLevel; muted: boolean } {
  const s = prefs.servers[serverId];
  return { level: s?.level ?? "mentions", muted: s?.muted === true && (s.muteUntil === undefined || s.muteUntil > Date.now()) };
}

/** Device-local quiet hours follow local time, including daylight-saving changes. */
export function notificationsQuiet(prefs = readNotifyPrefs(), now = new Date()) {
  if ((prefs.doNotDisturbUntil ?? 0) > now.getTime()) return true;
  const q = prefs.quietHours;
  if (!q?.enabled) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
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
  if (document.hasFocus() && window.location.pathname === opts.href) return;
  let n: Notification;
  try { n = new Notification(opts.title, { body: opts.body.slice(0, 180), tag: opts.tag, icon: "/icons/icon-192.png" }); }
  catch { return; }
  n.onclick = () => {
    window.focus();
    opts.open(opts.href);
    n.close();
  };
}
