"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { callHref, useCall } from "./CallProvider";
import { MixerButton } from "./AudioMixer";
import { ConnectionMeter } from "./ConnectionMeter";
import { PhoneOff } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Reconnecting…", connected: "Voice Connected", idle: "" } as const;

/**
 * Discord's "Voice Connected" panel above the user panel: where you're connected, the mixer and
 * Disconnect. Mute and deafen sit in the user panel; camera, screen and the rest on the call stage.
 */
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
          className="mx-2 mb-1.5 rounded-lg border border-white/[0.06] bg-black/30 p-2"
          data-testid="call-dock"
        >
          {/* Discord's layout: status and actions on one line, where you're connected underneath. */}
          <div className="flex items-center gap-1.5">
            <ConnectionMeter compact />
            <p className={`min-w-0 flex-1 truncate whitespace-nowrap text-sm font-bold ${call.status === "connected" ? "text-signal-green" : "text-signal-idle"}`} role="status">
              {STATUS_TEXT[call.status]}
            </p>
            <MixerButton size="sm" className="shrink-0" />
            <Tooltip label="Disconnect" side="top">
              <button
                type="button"
                aria-label="Disconnect"
                onClick={call.leave}
                className="touch-target relative flex size-8 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-red-500/20 hover:text-red-300"
              >
                <PhoneOff className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
          <Link href={callHref(call.target!)} className="block truncate px-1 text-xs text-slate-400 hover:text-white hover:underline">
            {call.target!.channelName} / {call.target!.serverName}
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
