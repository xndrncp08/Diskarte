"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { callHref, useCall } from "./CallProvider";
import { ConnectionMeter } from "./ConnectionMeter";
import { VoiceControls } from "./VoiceControls";

const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Reconnecting…", connected: "Voice Connected", idle: "" } as const;

/** Floating active-call widget pinned above the user panel while you browse other channels. */
export function CallDock() {
  const call = useCall();
  const visible = call.status !== "idle" && call.target;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="glass-strong mx-2 mb-2 rounded-xl p-2.5 shadow-lg shadow-black/40"
          data-testid="call-dock"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <ConnectionMeter />
            <div className="min-w-0">
              <p className={`text-sm font-bold ${call.status === "connected" ? "text-signal-green" : "text-signal-idle"}`} role="status">
                {STATUS_TEXT[call.status]}
              </p>
              <Link href={callHref(call.target!)} className="block truncate text-xs text-slate-400 hover:text-white hover:underline">
                {call.target!.channelName} / {call.target!.serverName}
              </Link>
            </div>
          </div>
          <VoiceControls size="sm" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
