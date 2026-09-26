"use client";

import { useIsClient } from "@/hooks/useIsClient";
import { formatDayDivider, formatTime, formatTimestamp, SERVER_TIME_ZONE } from "@/lib/chat-format";

/** Hydration-safe <time>: deterministic PH-time text on the server, viewer's local time after mount. */
export function Timestamp({ iso, variant = "full", className }: { iso: string; variant?: "full" | "time" | "day"; className?: string }) {
  const isClient = useIsClient();
  const tz = isClient ? undefined : SERVER_TIME_ZONE;
  const text = variant === "time" ? formatTime(iso, tz) : variant === "day" ? formatDayDivider(iso, tz) : formatTimestamp(iso, new Date(), tz);
  return (
    <time dateTime={iso} className={className} title={isClient ? new Date(iso).toLocaleString("en-PH") : undefined}>
      {text}
    </time>
  );
}
