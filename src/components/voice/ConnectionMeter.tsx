"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { SignalBars } from "@/components/retro/SignalBars";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { InertWhenExiting } from "@/components/ui/InertWhenExiting";
import { useCallStats } from "@/hooks/useCallStats";
import { HEALTH_LABEL, healthLevel } from "@/lib/call-stats";
import { cn } from "@/lib/utils";
import { useCall } from "./CallProvider";

function fmt(value: number | null, unit: string) {
  return value === null ? "—" : `${value}${unit}`;
}

/**
 * 8-bit connection meter for the active call: signal bars from LiveKit quality + measured latency /
 * packet loss, with a details popover (latency, loss, jitter, LiveKit's rating).
 */
export function ConnectionMeter() {
  const call = useCall();
  const stats = useCallStats(call.status === "connected" ? call.room : null);
  const level = call.status === "connected" ? healthLevel(stats, call.quality) : 1;
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
  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        aria-label={`Connection: ${HEALTH_LABEL[level]}, ${fmt(stats.rttMs, " ms")} latency, ${fmt(stats.lossPct, "%")} packet loss`}
        className="touch-target relative flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-white/10"
        data-testid="connection-meter"
      >
        <SignalBars level={level} />
        <span className={cn("font-pixel text-[8px] tabular-nums", color)} aria-hidden>
          {stats.rttMs === null ? HEALTH_LABEL[level].toUpperCase() : `${stats.rttMs}MS`}
        </span>
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
              className="glass-strong scanlines z-50 w-60 rounded-xl p-3 shadow-2xl shadow-black/60"
            >
              <p className="mb-2 flex items-center justify-between font-pixel text-[9px] text-sun">
                SIGNAL <SignalBars level={level} showLabel />
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">Latency (RTT)</dt>
                <dd className="text-right font-mono tabular-nums text-white">{fmt(stats.rttMs, " ms")}</dd>
                <dt className="text-slate-400">Packet loss</dt>
                <dd className="text-right font-mono tabular-nums text-white">{fmt(stats.lossPct, "%")}</dd>
                <dt className="text-slate-400">Jitter</dt>
                <dd className="text-right font-mono tabular-nums text-white">{fmt(stats.jitterMs, " ms")}</dd>
                <dt className="text-slate-400">LiveKit rating</dt>
                <dd className="text-right text-white">{HEALTH_LABEL[call.quality]}</dd>
              </dl>
            </InertWhenExiting>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  );
}
