import type { SignalLevel } from "@/components/retro/SignalBars";

/** Subset of WebRTC stats fields we read (RTCStatsReport entries). */
export interface StatLike {
  type: string;
  kind?: string;
  state?: string;
  nominated?: boolean;
  selected?: boolean;
  currentRoundTripTime?: number;
  roundTripTime?: number;
  fractionLost?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
}

export interface CallStats {
  /** Round-trip time to the SFU in ms. */
  rttMs: number | null;
  /** Packet loss over the last sample window, 0–100. */
  lossPct: number | null;
  /** Inbound audio jitter in ms. */
  jitterMs: number | null;
}

export interface LossTotals {
  lost: number;
  received: number;
}

export const EMPTY_STATS: CallStats = { rttMs: null, lossPct: null, jitterMs: null };

/**
 * Summarise one polling window of WebRTC stats. Loss is computed from the *delta* of cumulative
 * inbound counters since the previous poll (so an old burst doesn't dominate forever), combined with
 * the SFU's view of our uplink (remote-inbound-rtp.fractionLost); the worse of the two wins.
 */
export function summarizeStats(stats: StatLike[], previous: LossTotals | null): { stats: CallStats; totals: LossTotals } {
  let rtt: number | null = null;
  let jitter: number | null = null;
  let uplinkLoss: number | null = null;
  const totals: LossTotals = { lost: 0, received: 0 };

  for (const s of stats) {
    if (s.type === "candidate-pair" && (s.nominated || s.selected || s.state === "succeeded") && typeof s.currentRoundTripTime === "number") {
      rtt = Math.max(rtt ?? 0, s.currentRoundTripTime * 1000);
    } else if (s.type === "remote-inbound-rtp") {
      if (rtt === null && typeof s.roundTripTime === "number") rtt = s.roundTripTime * 1000;
      if (typeof s.fractionLost === "number") uplinkLoss = Math.max(uplinkLoss ?? 0, s.fractionLost * 100);
    } else if (s.type === "inbound-rtp") {
      totals.lost += Math.max(0, s.packetsLost ?? 0);
      totals.received += Math.max(0, s.packetsReceived ?? 0);
      if (typeof s.jitter === "number") jitter = Math.max(jitter ?? 0, s.jitter * 1000);
    }
  }

  let downlinkLoss: number | null = null;
  if (previous) {
    const dLost = totals.lost - previous.lost;
    const dReceived = totals.received - previous.received;
    if (dLost >= 0 && dReceived >= 0 && dLost + dReceived > 0) downlinkLoss = (dLost / (dLost + dReceived)) * 100;
  }
  const loss = downlinkLoss === null ? uplinkLoss : uplinkLoss === null ? downlinkLoss : Math.max(downlinkLoss, uplinkLoss);

  return {
    stats: {
      rttMs: rtt === null ? null : Math.round(rtt),
      lossPct: loss === null ? null : Math.round(loss * 10) / 10,
      jitterMs: jitter === null ? null : Math.round(jitter),
    },
    totals,
  };
}

/** Combine LiveKit's own quality level with measured latency/loss into arcade signal bars. */
export function healthLevel(stats: CallStats, livekitLevel: SignalLevel): SignalLevel {
  const { rttMs, lossPct } = stats;
  let measured: SignalLevel = 4;
  if ((rttMs ?? 0) > 400 || (lossPct ?? 0) > 10) measured = 1;
  else if ((rttMs ?? 0) > 200 || (lossPct ?? 0) > 3) measured = 2;
  else if ((rttMs ?? 0) > 100 || (lossPct ?? 0) > 1) measured = 3;
  return Math.min(measured, livekitLevel) as SignalLevel;
}

export const HEALTH_LABEL: Record<SignalLevel, string> = { 0: "Offline", 1: "Mahina", 2: "Okay", 3: "Malakas", 4: "Solid" };
