"use client";

import type { Room } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { EMPTY_STATS, summarizeStats, type CallStats, type LossTotals, type StatLike } from "@/lib/call-stats";

interface StatsTrack {
  getRTCStatsReport?: () => Promise<RTCStatsReport | undefined>;
}

function collect(report: RTCStatsReport | undefined, into: StatLike[]) {
  report?.forEach((value) => into.push(value as StatLike));
}

/** Polls WebRTC stats for our microphone and every remote audio track while in a call. */
export function useCallStats(room: Room | null, intervalMs = 2000): CallStats {
  const [stats, setStats] = useState<CallStats>(EMPTY_STATS);
  const previous = useRef<LossTotals | null>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    previous.current = null;

    async function poll() {
      const tracks: StatsTrack[] = [];
      for (const pub of room!.localParticipant?.trackPublications?.values() ?? []) if (pub.track) tracks.push(pub.track as StatsTrack);
      for (const participant of room!.remoteParticipants?.values() ?? []) {
        for (const pub of participant.audioTrackPublications?.values() ?? []) if (pub.track) tracks.push(pub.track as StatsTrack);
      }
      const entries: StatLike[] = [];
      await Promise.all(tracks.map(async (t) => collect(await t.getRTCStatsReport?.().catch(() => undefined), entries)));
      if (cancelled || entries.length === 0) return;
      const { stats: next, totals } = summarizeStats(entries, previous.current);
      previous.current = totals;
      setStats(next);
    }

    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [room, intervalMs]);

  return room ? stats : EMPTY_STATS;
}
