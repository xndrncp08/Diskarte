"use client";

import { MicOff, RotateCw, VolumeX, WifiLow } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/pulse/Button";
import { cn } from "@/lib/utils";
import { useCall, type CallContextValue } from "../CallProvider";

export type RecoveryKind = "reconnecting" | "audio" | "mic" | "poor";

/** What's wrong with the call right now, most urgent first; null when it's healthy (or there's no call). */
export function recoveryKind(call: Pick<CallContextValue, "status" | "quality" | "audioBlocked" | "micDenied">): RecoveryKind | null {
  if (call.status === "reconnecting") return "reconnecting";
  if (call.status !== "connected") return null;
  if (call.audioBlocked) return "audio";
  if (call.micDenied) return "mic";
  return call.quality <= 1 ? "poor" : null;
}

export const RECOVERY: Record<RecoveryKind, { title: string; body: string; action?: string }> = {
  reconnecting: { title: "Reconnecting…", body: "Your connection dropped. Stay on this page and we'll bring you back in." },
  audio: { title: "Call sound is off", body: "Your browser paused the sound until you click.", action: "Turn on sound" },
  mic: { title: "Microphone blocked", body: "Allow the microphone in your browser's site settings, then try again.", action: "Try again" },
  poor: { title: "Poor connection", body: "Others may hear you break up. Turn off your camera or move closer to your Wi-Fi." },
};
const ICONS: Record<RecoveryKind, ReactNode> = { reconnecting: <RotateCw />, audio: <VolumeX />, mic: <MicOff />, poor: <WifiLow /> };

/**
 * The call's recovery state inline: what happened and what to do next, with the fix as a button where there is one
 * (Turn on sound starts LiveKit's audio from this click; Try again asks for the mic by unmuting). Not a live region:
 * CallAnnouncer reads it out once. `prompt` marks where it shows (`wide` md and up, `phone` below, `all`), so Classic's
 * floating "turn on call audio" button steps aside while this one is on screen (pulse.css). `compact` drops the body.
 */
export function CallRecovery({ prompt, compact = false, className }: { prompt: "wide" | "phone" | "all"; compact?: boolean; className?: string }) {
  const call = useCall();
  const kind = recoveryKind(call);
  if (!kind) return null;
  const copy = RECOVERY[kind];
  const act = kind === "audio" ? () => void call.room?.startAudio().catch(() => toast.error("Couldn't start call sound. Try again.")) : kind === "mic" ? () => void call.toggleMute() : undefined;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-pulse-item border bg-pulse-surface px-3 py-2 font-pulse-text text-pulse-text",
        kind === "poor" || kind === "reconnecting" ? "border-pulse-line-strong" : "border-pulse-alert",
        className,
      )}
      data-recovery={kind}
      data-audio-prompt={kind === "audio" ? prompt : undefined}
    >
      <span aria-hidden className={cn("inline-flex shrink-0 [&_svg]:size-4", kind === "poor" || kind === "reconnecting" ? "text-pulse-muted" : "text-pulse-alert", kind === "reconnecting" && "pulse-motion:[&_svg]:animate-spin")}>
        {ICONS[kind]}
      </span>
      <p className="min-w-0 flex-1 text-pulse-label">
        <span className="font-semibold">{copy.title}</span>
        {!compact && <span className="text-pulse-muted"> {copy.body}</span>}
      </p>
      {act && copy.action && (
        <Button size="sm" variant={kind === "audio" ? "primary" : "secondary"} onClick={act}>
          {copy.action}
        </Button>
      )}
    </div>
  );
}

/**
 * The one live region for the call's recovery states (mounted once, by the canvas's CallStrip): each state is read out
 * when it starts, never again while it lasts or when the strip and the stage swap; "Back in the call" after a reconnect.
 * A connection that keeps flapping between poor and fine is announced once per call.
 */
export function CallAnnouncer() {
  const call = useCall();
  const kind = recoveryKind(call);
  const callKey = call.target?.channelId ?? null;
  const [text, setText] = useState("");
  const last = useRef<RecoveryKind | null>(null);
  const poorSaid = useRef<string | null>(null);
  useEffect(() => {
    if (!callKey) poorSaid.current = null;
    const previous = last.current;
    last.current = kind;
    if (kind === previous) return;
    if (!kind) return setText(previous === "reconnecting" && callKey ? "Back in the call." : "");
    if (kind === "poor") {
      if (poorSaid.current === callKey) return;
      poorSaid.current = callKey;
    }
    setText(`${RECOVERY[kind].title} ${RECOVERY[kind].body}`);
  }, [kind, callKey]);
  return (
    <p role="status" className="sr-only" data-testid="call-announcer">
      {text}
    </p>
  );
}
