"use client";

import { useIsClient } from "@/hooks/useIsClient";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { formatDayDivider, formatTime, formatTimestamp, SERVER_TIME_ZONE } from "@/lib/chat-format";

/** Hydration-safe <time>: deterministic PH-time text on the server, viewer's local time after mount. */
export function Timestamp({ iso, variant = "full", className }: { iso: string; variant?: "full" | "time" | "day"; className?: string }) {
  const isClient = useIsClient();
  const { hour24, language, timeZone } = useDisplayPrefs();
  const tz = isClient ? timeZone === "system" ? undefined : timeZone : SERVER_TIME_ZONE;
  const text = variant === "time" ? formatTime(iso, tz, hour24, language) : variant === "day" ? formatDayDivider(iso, tz, language) : formatTimestamp(iso, new Date(), tz, hour24, language);
  return (
    <time dateTime={iso} className={className} title={isClient ? new Date(iso).toLocaleString(language === "fil" ? "fil-PH" : "en-PH", { timeZone: tz }) : undefined}>
      {text}
    </time>
  );
}
