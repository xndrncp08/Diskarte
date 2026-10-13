"use client";

import { useEffect, useState } from "react";

/** True until `until` (an ISO time) passes, then re-renders on its own so locks lift on time. */
export function useTimedOut(until: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const end = until ? Date.parse(until) : 0;
  useEffect(() => {
    if (end <= now) return;
    // setTimeout caps at ~24.8 days; a week-long timeout just re-arms.
    const t = setTimeout(() => setNow(Date.now()), Math.min(Math.max(0, end - Date.now()), 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [end, now]);
  return end > now;
}
