/**
 * Offline outbox: messages written while the connection is down are kept in localStorage (so a
 * reload doesn't lose them) and flushed in order when the browser comes back online. Each entry
 * keeps its client-generated UUID, so a flush that races a slow earlier attempt is idempotent —
 * the server treats a duplicate id as "already sent".
 */
import { parseAttachments, type Attachment } from "./messages";

export interface OutboxEntry {
  id: string;
  userId: string;
  attachments?: Attachment[];
  /** Channel or DM conversation id. */
  target: string;
  content: string;
  replyToId: string | null;
  threadId: string | null;
  sticker: string | null;
  /** Forum post title. */
  title?: string | null;
  createdAt: string;
}

const KEY = "diskarte:outbox:v2";
const MAX_ENTRIES = 50;
let memory: OutboxEntry[] = [];

function readAll(): OutboxEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return memory;
  }
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    memory = Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch { memory = []; }
  return memory;
}

function writeAll(entries: OutboxEntry[]) {
  memory = entries;
  try {
    if (entries.length) localStorage.setItem(KEY, JSON.stringify(entries));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full / blocked: the in-memory copy in the chat still shows the queued message.
  }
}

function isEntry(value: unknown): value is OutboxEntry {
  const v = value as Partial<OutboxEntry> | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.userId === "string" &&
    v.userId.length > 0 &&
    typeof v.target === "string" &&
    typeof v.content === "string" &&
    typeof v.createdAt === "string" &&
    (v.replyToId === null || typeof v.replyToId === "string") &&
    (v.threadId === null || typeof v.threadId === "string") &&
    (v.sticker === null || typeof v.sticker === "string")
  );
}

export function outboxFor(target: string, userId: string): OutboxEntry[] {
  return readAll().filter((e) => e.target === target && e.userId === userId).map((e) => ({ ...e, attachments: parseAttachments(e.attachments ?? []) }));
}

export function enqueue(entry: OutboxEntry) {
  const entries = readAll().filter((e) => !(e.id === entry.id && e.userId === entry.userId));
  // A full queue must never silently evict somebody's unsent message.
  if (entries.length >= MAX_ENTRIES) return false;
  writeAll([...entries, entry]);
  return true;
}

export function dequeue(id: string, userId: string) {
  writeAll(readAll().filter((e) => !(e.id === id && e.userId === userId)));
}

export function outboxSize(): number {
  return readAll().length;
}

/** True when a failure looks like "no network" rather than the server refusing the message. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(message);
}

/** Forget this account's unsent messages (sign-out on a shared device, account deletion). */
export function clearOutbox() {
  memory = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("diskarte:outbox");
  } catch {
    // Storage blocked: nothing was persisted either.
  }
}
