"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { SignalBars, type SignalLevel } from "@/components/retro/SignalBars";
import { useShellKind } from "@/components/shell/ShellKind";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";
import { useCallStats } from "@/hooks/useCallStats";
import { HEALTH_LABEL, healthLevel } from "@/lib/call-stats";
import { cn } from "@/lib/utils";
import { useCall } from "./CallProvider";

function fmt(value: number | null, unit: string) {
  return value === null ? "—" : `${value}${unit}`;
}

/** Pulse's words for the same levels (Classic keeps its arcade labels). */
export const PULSE_HEALTH: Record<SignalLevel, string> = { 0: "Offline", 1: "Poor", 2: "Fair", 3: "Good", 4: "Excellent" };

/** Pulse bars: four rising bars, as many filled as the level (the shape cue), tinted by health, always beside the word. */
function PulseBars({ level }: { level: SignalLevel }) {
  const tone = level <= 1 ? "text-pulse-alert" : level === 2 ? "text-pulse-accent-ink" : "text-pulse-live";
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden className={cn("shrink-0", tone)}>
      {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 3.75} y={12 - (i + 1) * 3} width="2.5" height={(i + 1) * 3} rx="0.75" fill="currentColor" opacity={i < level ? 1 : 0.25} />)}
    </svg>
  );
}

/**
 * 8-bit connection meter for the active call: signal bars from LiveKit quality + measured latency /
 * packet loss, with a details popover (latency, loss, jitter, LiveKit's rating). In Pulse: Pulse bars, the health as a
 * word ("Good · 42 ms") and a Pulse popover, same numbers.
 */
/** `compact`: just the bars (the latency stays in the label and the details popover); Pulse keeps the word. */
export function ConnectionMeter({ compact = false }: { compact?: boolean } = {}) {
  const call = useCall();
  const pulse = useShellKind() === "pulse";
  const stats = useCallStats(call.status === "connected" ? call.room : null);
  const level = call.status === "connected" ? healthLevel(stats, call.quality) : 1;
  const labels = pulse ? PULSE_HEALTH : HEALTH_LABEL;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const { style, side } = useFloating(open, trigger, panel, { side: "top", align: "start", offset: 8 });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const color = level <= 1 ? "text-red-400" : level === 2 ? "text-signal-idle" : "text-signal-green";
  const dt = pulse ? "text-pulse-muted" : "text-slate-400";
  const dd = pulse ? "text-pulse-text" : "text-white";
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        aria-label={`Connection: ${labels[level]}, ${fmt(stats.rttMs, " ms")} latency, ${fmt(stats.lossPct, "%")} packet loss`}
        className={
          pulse
            ? "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-pulse-control px-2 font-pulse-text text-pulse-caption font-semibold text-pulse-text hover:bg-pulse-hover pointer-coarse:min-h-11"
            : "touch-target relative flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-white/10"
        }
        data-testid="connection-meter"
        data-level={level}
      >
        {pulse ? (
          <>
            <PulseBars level={level} />
            <span aria-hidden>{PULSE_HEALTH[level]}</span>
            {!compact && stats.rttMs !== null && <span aria-hidden className="font-normal tabular-nums text-pulse-muted">{stats.rttMs} ms</span>}
          </>
        ) : (
          <>
            <SignalBars level={level} />
            <span className={cn("font-pixel text-[8px] tabular-nums", color, compact && "hidden")} aria-hidden>
              {stats.rttMs === null ? HEALTH_LABEL[level].toUpperCase() : `${stats.rttMs}MS`}
            </span>
          </>
        )}
      </button>
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <InertWhenExiting
              ref={panel}
              id={id}
              role="dialog"
              aria-label="Connection details"
              data-floating="connection-details"
              data-side={side}
              style={style}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className={pulse ? "z-(--pulse-z-menu) w-60 rounded-pulse-item border border-pulse-line bg-pulse-raised p-3 font-pulse-text shadow-pulse-2" : "glass-strong scanlines z-50 w-60 rounded-xl p-3 shadow-2xl shadow-black/60"}
            >
              {pulse ? (
                <p className="mb-2 flex items-center justify-between text-pulse-label font-semibold text-pulse-text">
                  Connection
                  <span className="inline-flex items-center gap-1.5"><PulseBars level={level} />{PULSE_HEALTH[level]}</span>
                </p>
              ) : (
                <p className="mb-2 flex items-center justify-between font-pixel text-[9px] text-sun">
                  SIGNAL <SignalBars level={level} showLabel />
                </p>
              )}
              <dl className={cn("grid grid-cols-2 gap-x-3 gap-y-1", pulse ? "text-pulse-caption" : "text-xs")}>
                <dt className={dt}>Latency (RTT)</dt>
                <dd className={cn("text-right font-mono tabular-nums", dd)}>{fmt(stats.rttMs, " ms")}</dd>
                <dt className={dt}>Packet loss</dt>
                <dd className={cn("text-right font-mono tabular-nums", dd)}>{fmt(stats.lossPct, "%")}</dd>
                <dt className={dt}>Jitter</dt>
                <dd className={cn("text-right font-mono tabular-nums", dd)}>{fmt(stats.jitterMs, " ms")}</dd>
                <dt className={dt}>LiveKit rating</dt>
                <dd className={cn("text-right", dd)}>{labels[call.quality]}</dd>
              </dl>
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
