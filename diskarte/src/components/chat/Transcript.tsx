"use client";

import { useState } from "react";
import { PulseLine } from "@/components/pulse/PulseLine";
import { useShellKind } from "@/components/shell/ShellKind";
import { useIsClient } from "@/hooks/useIsClient";
import { formatTime, SERVER_TIME_ZONE } from "@/lib/chat-format";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { Timestamp } from "./Timestamp";

/** Between two days of messages. Classic: a pixel-font rule; Pulse: a quiet editorial date. */
export function DaySeparator({ iso }: { iso: string }) {
  if (useShellKind() !== "pulse") {
    return (
      <div className="mx-4 my-4 flex items-center gap-2" role="separator">
        <span className="h-px flex-1 bg-white/10" />
        <Timestamp iso={iso} variant="day" className="font-silk text-[10px] uppercase tracking-wider text-slate-500" />
        <span className="h-px flex-1 bg-white/10" />
      </div>
    );
  }
  return (
    <div className="mx-3 mb-1 mt-6 flex items-baseline gap-3 font-pulse-text md:mx-5" role="separator">
      <Timestamp iso={iso} variant="day" className="shrink-0 font-pulse-display text-pulse-label font-semibold text-pulse-muted" />
      <span className="h-px flex-1 bg-pulse-line" aria-hidden />
    </div>
  );
}

/** Pulse only: the sun "New · 3:42 PM" line above the first message you haven't read. */
export function UnreadLine({ iso }: { iso: string }) {
  const { hour24, language, timeZone } = useDisplayPrefs();
  // Hydration-safe like <Timestamp>: Philippine time on the server, the viewer's own after mount.
  const tz = useIsClient() ? (timeZone === "system" ? undefined : timeZone) : SERVER_TIME_ZONE;
  return <PulseLine label={`New · ${formatTime(iso, tz, hour24, language)}`} className="mx-3 md:mx-5" />;
}

/**
 * Where you'd read up to when the conversation opened, or null when nothing was unread then (so the "New" line stays
 * put while you read and never appears for messages that arrive while you watch). It takes the first known read
 * position, then only moves back (Mark Unread); `scope` (the channel or DM id) starts it over.
 */
export function useReadPosition(scope: string, readAt: string | null | undefined, newestAt: string | undefined) {
  const [state, setState] = useState({ scope, at: readAt, newest: newestAt });
  const known = state.scope === scope && state.at != null;
  if (!known ? state.scope !== scope || readAt != null : readAt != null && Date.parse(readAt) < Date.parse(state.at!)) setState({ scope, at: readAt, newest: known ? state.newest : newestAt });
  const at = state.scope === scope ? state.at : null;
  const newest = state.scope === scope ? state.newest : undefined;
  return at && newest && Date.parse(newest) > Date.parse(at) ? at : null;
}
