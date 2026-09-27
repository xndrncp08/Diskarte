"use client";

import { AudioLines, Headphones, HeadphoneOff, Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useCall } from "./CallProvider";

function ControlButton({
  label,
  active,
  danger,
  onClick,
  children,
  size,
  secondary = false,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
  size: "sm" | "lg";
  /** In the compact dock on touch screens only mic / deafen / leave stay, at 44 px. */
  secondary?: boolean;
}) {
  return (
    <Tooltip label={label} side="top" className={cn(size === "sm" && "min-w-0 flex-1", size === "sm" && secondary && "pointer-coarse:hidden")}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex items-center justify-center transition-[color,background-color,transform] duration-150",
          "active:scale-95 motion-reduce:active:scale-100",
          // 6 buttons must fit a 360 px phone: 44 px (the touch minimum) below sm, 48 px above.
          size === "lg" ? "size-11 rounded-2xl sm:size-12" : "h-8 w-full rounded-md pointer-coarse:h-11",
          danger ? "bg-red-500 text-white hover:bg-red-400" : active ? "bg-white text-abyss hover:bg-slate-200" : "bg-white/10 text-slate-200 hover:bg-white/20",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** Mic / deafen / camera / screen / noise suppression / leave — used by the stage and the dock. */
export function VoiceControls({ size = "lg", compact = false }: { size?: "sm" | "lg"; compact?: boolean }) {
  const call = useCall();
  const icon = size === "lg" ? "size-5" : "size-4";
  return (
    <div
      className={cn("flex items-center", size === "lg" ? "flex-wrap justify-center gap-1.5 sm:gap-3" : "w-full gap-1")}
      role="toolbar"
      aria-label="Call controls"
    >
      <ControlButton size={size} label={call.muted ? "Unmute" : "Mute"} active={call.muted} onClick={() => void call.toggleMute()}>
        {call.muted ? <MicOff className={cn(icon, "text-red-500")} aria-hidden /> : <Mic className={icon} aria-hidden />}
      </ControlButton>
      <ControlButton size={size} label={call.deafened ? "Undeafen" : "Deafen"} active={call.deafened} onClick={() => void call.toggleDeafen()}>
        {call.deafened ? <HeadphoneOff className={cn(icon, "text-red-500")} aria-hidden /> : <Headphones className={icon} aria-hidden />}
      </ControlButton>
      {!compact && (
        <>
          <ControlButton size={size} secondary label={call.camera ? "Turn off camera" : "Turn on camera"} active={call.camera} onClick={() => void call.toggleCamera()}>
            {call.camera ? <Video className={icon} aria-hidden /> : <VideoOff className={icon} aria-hidden />}
          </ControlButton>
          <ControlButton size={size} secondary label={call.screen ? "Stop sharing" : "Share screen"} active={call.screen} onClick={() => void call.toggleScreen()}>
            {call.screen ? <MonitorOff className={icon} aria-hidden /> : <MonitorUp className={icon} aria-hidden />}
          </ControlButton>
          <ControlButton size={size} secondary label={`Noise suppression ${call.noiseSuppression ? "on" : "off"}`} active={call.noiseSuppression} onClick={() => void call.toggleNoiseSuppression()}>
            <AudioLines className={icon} aria-hidden />
          </ControlButton>
        </>
      )}
      <ControlButton size={size} label="Disconnect" danger onClick={call.leave}>
        <PhoneOff className={icon} aria-hidden />
      </ControlButton>
    </div>
  );
}
