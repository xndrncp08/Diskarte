"use client";

import Link from "next/link";
import { HeadphoneOff, Headphones, Mic, MicOff, PhoneOff } from "lucide-react";
import { MixerButton } from "@/components/voice/AudioMixer";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { ConnectionMeter } from "@/components/voice/ConnectionMeter";
import { IconButton } from "../Button";
import { LiveIndicator } from "../PulseLine";

const STATUS_TEXT = { connecting: "Connecting…", reconnecting: "Reconnecting…", connected: "Live", idle: "" } as const;

/**
 * Classic's CallDock and the user panel's mute/deafen as one slim live strip across the top of the canvas
 * (tablets and up; phones keep MobileNavigation's call strip). Same call, same actions; the full voice
 * redesign is Step 6.
 */
export function CallStrip() {
  const call = useCall();
  if (call.status === "idle" || !call.target) return null;
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-pulse-line bg-pulse-live-tint px-3 font-pulse-text max-md:hidden" data-testid="call-dock">
      {call.status === "connected" ? <LiveIndicator label="Voice connected" className="shrink-0" /> : <span className="shrink-0 text-pulse-label font-semibold text-pulse-text" role="status">{STATUS_TEXT[call.status]}</span>}
      <ConnectionMeter compact />
      <Link href={callHref(call.target)} className="min-w-0 truncate text-pulse-label text-pulse-text hover:underline">
        {call.target.channelName} <span className="text-pulse-muted">· {call.target.serverName}</span>
      </Link>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton size="sm" tooltip label={call.muted ? "Unmute" : "Mute"} aria-pressed={call.muted} icon={call.muted ? <MicOff /> : <Mic />} onClick={() => void call.toggleMute()} />
        <IconButton size="sm" tooltip label={call.deafened ? "Undeafen" : "Deafen"} aria-pressed={call.deafened} icon={call.deafened ? <HeadphoneOff /> : <Headphones />} onClick={() => void call.toggleDeafen()} />
        <MixerButton size="sm" />
        <IconButton size="sm" variant="danger" tooltip label="Disconnect" icon={<PhoneOff />} onClick={call.leave} />
      </span>
    </div>
  );
}
