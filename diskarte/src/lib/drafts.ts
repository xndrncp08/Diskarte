import { useCallback, useEffect, useSyncExternalStore } from "react";

const PREFIX = "diskarte:draft:";
const memory = new Map<string, string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
const keyFor = (userId: string, conversation: string) => `${PREFIX}${userId}:${conversation}`;
function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  let value = "";
  try { value = localStorage.getItem(key)?.slice(0, 5000) ?? ""; } catch { /* session memory */ }
  memory.set(key, value); return value;
}
function flush(key: string) {
  clearTimeout(timers.get(key)); timers.delete(key);
  try { const text = memory.get(key) ?? ""; if (text) localStorage.setItem(key, text); else localStorage.removeItem(key); } catch { /* session memory */ }
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** Text only: files and signed attachment URLs are never stored as drafts. Scoped to the account. */
export function useDraft(userId: string, conversation: string) {
  const key = keyFor(userId, conversation);
  const value = useSyncExternalStore(subscribe, () => read(key), () => "");
  const set = useCallback((next: string | ((previous: string) => string)) => {
    memory.set(key, (typeof next === "function" ? next(read(key)) : next).slice(0, 5000));
    clearTimeout(timers.get(key)); timers.set(key, setTimeout(() => flush(key), 250));
    listeners.forEach((listener) => listener());
  }, [key]);
  useEffect(() => {
    const save = () => flush(key);
    window.addEventListener("pagehide", save);
    return () => { window.removeEventListener("pagehide", save); save(); };
  }, [key]);
  return [value, set] as const;
}
export function clearDrafts() {
  timers.forEach(clearTimeout); timers.clear(); memory.clear();
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}
