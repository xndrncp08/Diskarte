"use client";

import { useIsClient } from "@/hooks/useIsClient";
import { formatDayDivider, formatRelative, SERVER_TIME_ZONE } from "@/lib/chat-format";
import { useDisplayPrefs } from "@/lib/display-prefs";

/**
 * A short relative <time> for lists and tiles ("5 min. ago", "in 2 days", "Nov 1"). Hydration-safe like Timestamp:
 * the server renders the date in PH time, the relative text appears after mount; the full date is the tooltip.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const isClient = useIsClient();
  const { language, timeZone } = useDisplayPrefs();
  const tz = isClient ? (timeZone === "system" ? undefined : timeZone) : SERVER_TIME_ZONE;
  return (
    <time dateTime={iso} className={className} title={isClient ? new Date(iso).toLocaleString(language === "fil" ? "fil-PH" : "en-PH", { timeZone: tz }) : undefined}>
      {isClient ? formatRelative(iso, new Date(), tz, language) : formatDayDivider(iso, tz, language)}
    </time>
  );
}
