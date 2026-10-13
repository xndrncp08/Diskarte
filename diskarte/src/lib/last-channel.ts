/**
 * The channel you last had open in each server (per browser), so the rail can link straight to it:
 * no redirect hop, and Next can prefetch the whole server shell behind the link.
 */
const KEY = "diskarte:last-channel";
const listeners = new Set<() => void>();

export function readLastChannels(): string {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

/** The remembered channel for one server, from `readLastChannels()`'s snapshot (bad JSON = none). */
export function lastChannelIn(snapshot: string, serverId: string): string | undefined {
  try {
    const value = (JSON.parse(snapshot) as Record<string, unknown>)[serverId];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function rememberChannel(serverId: string, channelId: string) {
  try {
    let all: Record<string, string> = {};
    try {
      all = JSON.parse(readLastChannels());
    } catch {
      // Corrupt entry: start over.
    }
    if (all[serverId] === channelId) return;
    localStorage.setItem(KEY, JSON.stringify({ ...all, [serverId]: channelId }));
  } catch {
    return;
  }
  listeners.forEach((l) => l());
}

export function subscribeLastChannels(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
