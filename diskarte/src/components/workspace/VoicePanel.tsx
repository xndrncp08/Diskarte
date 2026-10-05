"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { StageSkeleton } from "@/components/voice/StageSkeleton";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { WorkspacePanel } from "./WorkspacePanel";
import { useIsCanvas } from "./WorkspaceProvider";

const CallGrid = dynamic(() => import("@/components/voice/live/CallGrid").then((m) => m.CallGrid), { ssr: false, loading: () => <StageSkeleton /> });

/** Whether the Voice panel has something to show here: a live call whose own page isn't open. */
export function useVoicePanelAvailable(): boolean {
  const call = useCall();
  const pathname = usePathname();
  const isCanvas = useIsCanvas();
  return isCanvas && call.status === "connected" && !!call.target && !!call.room && pathname !== callHref(call.target);
}

/**
 * The active call as a panel on the canvas while you're elsewhere (text chat, DMs, another server).
 * The LiveKit room lives in CallProvider above the whole app, so moving, minimizing or tiling this
 * panel never touches the connection.
 */
export function VoicePanel() {
  const call = useCall();
  const available = useVoicePanelAvailable();
  if (!available || !call.target) return null;
  return (
    <WorkspacePanel id="voice" title={`Voice · ${call.target.channelName}`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CallGrid />
      </div>
    </WorkspacePanel>
  );
}
