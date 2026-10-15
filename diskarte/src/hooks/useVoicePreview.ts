"use client";
import { useEffect, useRef, useState } from "react";
import { useServerVoiceActivity } from "@/components/providers/PresenceProvider";
import type { VoicePreview } from "@/lib/voice-preview";
/** No interval: initial fetch, shared presence/webhook invalidations, reconnect and foreground. */
export function useVoicePreview(serverId: string) {
  const activity = useServerVoiceActivity(serverId);
  const [data, setData] = useState<VoicePreview | null>(null), [problem, setProblem] = useState("");
  const [retry, setRetry] = useState(0);
  const schedule = useRef<() => void>(() => {});
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined, loading = false, dirty = true, last = 0;
    const refresh = () => {
      dirty = true;
      if (timer || loading || document.visibilityState !== "visible" || !navigator.onLine) return;
      timer = setTimeout(() => { timer = undefined; void load(); }, Math.max(180, 1400 - (Date.now() - last)));
    };
    const load = async () => {
      loading = true; dirty = false; last = Date.now();
      try {
        const response = await fetch(`/api/voice-preview?serverId=${serverId}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(response.status === 403 ? "Access to this server changed." : "Live voice activity couldn’t load. Try again.");
        const next: VoicePreview = await response.json();
        if (!controller.signal.aborted && navigator.onLine) { setData(next); setProblem(""); }
      } catch (error) {
        if (!controller.signal.aborted) { setData(null); setProblem(error instanceof Error ? error.message : "Voice activity is unavailable."); }
      } finally { loading = false; if (dirty && !controller.signal.aborted) refresh(); }
    };
    const offline = () => { setData(null); setProblem("You’re offline. Reconnect to check voice activity."); };
    schedule.current = refresh; refresh();
    window.addEventListener("online", refresh); window.addEventListener("offline", offline); document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); schedule.current = () => {}; clearTimeout(timer); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); document.removeEventListener("visibilitychange", refresh); };
  }, [serverId, retry]);
  useEffect(() => { schedule.current(); }, [activity.revision]);
  return { data, problem, reconnecting: !activity.connected, retry: () => setRetry((n) => n + 1) };
}
