"use client";

import { AudioLines, HeadphoneOff, Headphones, Mic, MicOff, MonitorUp, PhoneOff, SlidersVertical, Video, VideoOff } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconButton } from "@/components/pulse/Button";
import { Toolbar } from "@/components/pulse/Controls";
import { cn } from "@/lib/utils";
import { useAudioMixer } from "../AudioMixer";
import { useCall } from "../CallProvider";

/**
 * A labelled stage-dock control: icon over a word that never changes ("Mute" stays "Mute"; pressed is aria-pressed, a
 * selected tint and the crossed-out icon), at least 44 px on every pointer. Shared by the soundboard and activities
 * triggers, so the whole dock reads as one row.
 */
export const DOCK_BUTTON =
  "relative inline-flex min-h-14 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-pulse-item px-2 py-1.5 font-pulse-text text-pulse-caption font-semibold text-pulse-text " +
  "transition-[background-color,transform] duration-(--pulse-dur-press) ease-(--pulse-ease) hover:bg-pulse-hover active:bg-pulse-pressed pulse-motion:active:scale-[0.97] " +
  "aria-pressed:bg-pulse-selected aria-expanded:bg-pulse-selected [&_svg]:size-5";

export function DockButton({ icon, label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string }) {
  return (
    <button type="button" className={cn(DOCK_BUTTON, className)} {...props}>
      <span aria-hidden className="inline-flex">{icon}</span>
      {label}
    </button>
  );
}

// IconButton's quiet look plus a pressed state that isn't colour alone (the icon is crossed out too).
const PRESSED = "aria-pressed:bg-pulse-selected aria-pressed:text-pulse-text";

/**
 * Mute, Deafen, Camera, Share screen (and the mixer) with fixed names and aria-pressed, then Leave. `layout`:
 * `strip` (icon buttons with tooltips), `dock` (labelled buttons, plus the noise filter), `compact` (phones: Mute and
 * Leave only). One Tab stop, arrow keys between controls (Pulse Toolbar).
 */
export function CallControls({ layout, extras, className }: { layout: "strip" | "dock" | "compact"; extras?: ReactNode; className?: string }) {
  const call = useCall();
  const mixer = useAudioMixer();
  const toggles = [
    { label: "Mute", pressed: call.muted, icon: call.muted ? <MicOff /> : <Mic />, run: call.toggleMute },
    { label: "Deafen", pressed: call.deafened, icon: call.deafened ? <HeadphoneOff /> : <Headphones />, run: call.toggleDeafen },
    { label: "Camera", pressed: call.camera, icon: call.camera ? <Video /> : <VideoOff />, run: call.toggleCamera },
    { label: "Share screen", pressed: call.screen, icon: <MonitorUp />, run: call.toggleScreen },
    ...(layout === "dock" ? [{ label: "Noise filter", pressed: call.noiseSuppression, icon: <AudioLines />, run: call.toggleNoiseSuppression }] : []),
  ].slice(0, layout === "compact" ? 1 : undefined);

  if (layout === "dock")
    return (
      <Toolbar label="Call controls" className={cn("flex-wrap justify-center", className)}>
        {toggles.map((t) => <DockButton key={t.label} label={t.label} icon={t.icon} aria-pressed={t.pressed} onClick={() => void t.run()} />)}
        {extras}
        {mixer && <DockButton label="Mixer" icon={<SlidersVertical />} aria-haspopup="dialog" onClick={mixer.openMixer} />}
        <DockButton label="Leave" icon={<PhoneOff />} onClick={call.leave} className="bg-pulse-alert text-pulse-on-alert hover:bg-pulse-alert hover:brightness-105 active:bg-pulse-alert" />
      </Toolbar>
    );
  const size = layout === "compact" ? "md" : "sm";
  return (
    <Toolbar label="Call controls" className={cn("items-center", className)}>
      {toggles.map((t) => <IconButton key={t.label} size={size} tooltip label={t.label} aria-pressed={t.pressed} icon={t.icon} className={PRESSED} onClick={() => void t.run()} />)}
      {layout === "strip" && mixer && <IconButton size={size} tooltip label="Audio mixer" aria-haspopup="dialog" icon={<SlidersVertical />} onClick={mixer.openMixer} />}
      <IconButton size={size} variant="danger" tooltip label="Leave call" icon={<PhoneOff />} onClick={call.leave} />
    </Toolbar>
  );
}
