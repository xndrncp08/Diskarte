"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutPanelTop } from "lucide-react";
import { MixerButton } from "@/components/voice/AudioMixer";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { ConnectionMeter } from "@/components/voice/ConnectionMeter";
import { VoiceControls } from "@/components/voice/VoiceControls";
import { Tooltip } from "@/components/ui/Tooltip";
import { useVoicePanelAvailable } from "./VoicePanel";
import { useWorkspace, useWorkspaceStore } from "./WorkspaceProvider";

const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Reconnecting…", connected: "Voice Connected", idle: "" } as const;

/**
 * Floating active-call controls, docked in the canvas tray: they persist over every panel and page,
 * so you can minimize chat, switch channels or rearrange the workspace without dropping audio.
 */
export function CallOverlay() {
  const call = useCall();
  const store = useWorkspaceStore();
  const voiceAvailable = useVoicePanelAvailable();
  const voiceHidden = useWorkspace((s) => s.panels.voice.minimized || s.panels.voice.closed);
  const visible = call.status !== "idle" && call.target;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-auto flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 py-1.5 pl-3 pr-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl"
          data-testid="call-dock"
        >
          <ConnectionMeter />
          <div className="min-w-0 max-w-48">
            <p className={`text-xs font-bold ${call.status === "connected" ? "text-signal-green" : "text-signal-idle"}`} role="status">
              {STATUS_TEXT[call.status]}
            </p>
            <Link href={callHref(call.target!)} className="block truncate text-[11px] text-slate-400 hover:text-white hover:underline">
              {call.target!.channelName} / {call.target!.serverName}
            </Link>
          </div>
          {voiceAvailable && (
            <Tooltip label={voiceHidden ? "Show call" : "Call panel is open"} side="top">
              <button
                type="button"
                aria-label="Show call"
                aria-pressed={!voiceHidden}
                onClick={() => store.setMinimized("voice", false)}
                className="flex size-7 items-center justify-center rounded-md bg-white/10 text-slate-200 transition-colors hover:bg-white/20 aria-pressed:text-sun"
              >
                <LayoutPanelTop className="size-4" aria-hidden />
              </button>
            </Tooltip>
          )}
          <MixerButton size="sm" />
          <div className="shrink-0">
            <VoiceControls size="sm" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
