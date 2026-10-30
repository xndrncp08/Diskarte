/**
 * Durable read receipts. Reading a channel or DM is queued here (localStorage) until the server
 * confirms it, so a receipt survives the tab closing, an installed app being suspended mid-request,
 * or a dropped connection — otherwise the server still thinks it's unread and the badge (and a
 * push) comes back later. Each receipt says "read up to this moment", so sending it late never
 * marks newer messages read.
 */
import type { BrowserSupabase } from "@/lib/supabase/browser";

type ReadKind = "channel" | "dm";
type Queue = Record<string, string>; // "channel:<id>" | "dm:<id>" -> ISO time read up to

const KEY = "diskarte:pending-reads";
// Older databases only have the "now" receipts (before 20261015010000_notification_read_state).
const MISSING_FUNCTION = /PGRST202|Could not find the function|does not exist/i;

type Rpc = Pick<BrowserSupabase, "rpc">;

function read(): Queue {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Queue) : {};
  } catch {
    return {};
  }
}

function write(queue: Queue) {
  try {
    if (Object.keys(queue).length) localStorage.setItem(KEY, JSON.stringify(queue));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: receipts still go out, they just can't wait across a reload.
  }
}

/** Remember that `id` was read up to `at` (keeps the later of two marks). */
export function queueRead(kind: ReadKind, id: string, at: string) {
  const queue = read();
  const key = `${kind}:${id}`;
  if (!queue[key] || Date.parse(at) > Date.parse(queue[key])) queue[key] = at;
  write(queue);
}

/** A bulk read only acknowledges the exact receipt sent, never a newer local read. */
export function confirmRead(kind: ReadKind, id: string, at: string) {
  const queue = read();
  if (queue[`${kind}:${id}`] !== at) return;
  delete queue[`${kind}:${id}`];
  write(queue);
}

/** Explicit Mark Unread supersedes a read that has not left this device yet. */
export function forgetRead(kind: ReadKind, id: string) {
  const queue = read();
  delete queue[`${kind}:${id}`];
  write(queue);
}

export function pendingReads(): Queue {
  return read();
}

async function send(supabase: Rpc, kind: ReadKind, id: string, at: string) {
  const until = kind === "channel" ? await supabase.rpc("mark_channel_read_until", { p_channel: id, p_at: at }) : await supabase.rpc("mark_dm_read_until", { p_conversation_id: id, p_at: at });
  if (!until.error) return true;
  if (!MISSING_FUNCTION.test(`${until.error.code ?? ""} ${until.error.message ?? ""}`)) return false;
  const now = kind === "channel" ? await supabase.rpc("mark_channel_read", { p_channel: id }) : await supabase.rpc("mark_dm_read", { p_conversation_id: id });
  return !now.error;
}

let flushing: Promise<void> | null = null;

/** Send every queued receipt; confirmed ones leave the queue, failures stay for the next try. */
export function flushReads(supabase: Rpc): Promise<void> {
  // One flush at a time; the guard is cleared only after the run settles (an empty queue settles
  // synchronously, which must not leave a stale guard behind).
  if (flushing) return flushing;
  flushing = sendAll(supabase).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function sendAll(supabase: Rpc) {
  for (const [key, at] of Object.entries(read())) {
    const [kind, id] = key.split(":") as [ReadKind, string];
    let ok = false;
    try {
      ok = await send(supabase, kind, id, at);
    } catch {
      ok = false;
    }
    if (!ok) continue;
    // Only drop it if nothing newer was queued while this one was in flight.
    confirmRead(kind, id, at);
  }
}

/**
 * Close alerts already shown for something you've now read: the service worker's push
 * notifications (same tag) and this page's own. Best effort — the OS may already have moved them.
 */
const shown = new Map<string, Notification>();
export function trackShownNotification(tag: string, notification: Notification) {
  shown.set(tag, notification);
  notification.addEventListener?.("close", () => shown.get(tag) === notification && shown.delete(tag));
}

export function closeNotifications(tag: string) {
  shown.get(tag)?.close();
  shown.delete(tag);
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  void navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg?.getNotifications({ tag }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => undefined);
}

/** The alert tag for a conversation; matches what the push worker uses. */
export const notificationTag = (kind: ReadKind, id: string) => (kind === "dm" ? `dm:${id}` : `channel:${id}`);
