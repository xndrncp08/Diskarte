"use client";

import { useEffect, useEffectEvent } from "react";

/** Browser online events miss short network failures. Retry with backoff while this chat is open. */
export function useOutboxRetry(flush: () => Promise<void>) {
  const deliver = useEffectEvent(flush);
  useEffect(() => {
    let stopped = false;
    let running = false;
    let delay = 2_000;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (stopped || running) return;
      clearTimeout(timer);
      running = true;
      try {
        if (navigator.onLine && document.visibilityState === "visible") await deliver();
      } finally {
        running = false;
        if (!stopped) timer = setTimeout(() => void run(), delay);
        delay = Math.min(delay * 2, 30_000);
      }
    };
    const resume = () => { delay = 2_000; void run(); };
    timer = setTimeout(() => void run(), delay);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
}
