"use client";

import type { Participant, Room } from "livekit-client";
import { HeadphoneOff, Mic, MicOff, SignalLow, Video } from "lucide-react";
import { useEffect, useReducer } from "react";
import { Avatar } from "@/components/pulse/Avatar";
import type { AvatarProfile } from "@/components/profile/UserAvatar";
import { cn } from "@/lib/utils";

// RoomEvent values, spelled out so the live strip doesn't load livekit-client (it's only fetched once you join).
const PEOPLE_EVENTS = ["participantConnected", "participantDisconnected", "participantNameChanged", "participantMetadataChanged"] as const;

/** Everyone in the call (you first), re-read only when someone joins, leaves or renames: never per speaking change. */
export function useRoomPeople(room: Room | null): Participant[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!room) return;
    const events = room as unknown as { on: (event: string, fn: () => void) => void; off: (event: string, fn: () => void) => void };
    PEOPLE_EVENTS.forEach((event) => events.on(event, bump));
    return () => PEOPLE_EVENTS.forEach((event) => events.off(event, bump));
  }, [room]);
  return room ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
}

/**
 * A person's avatar with the Pulse speaking ring: the Avatar's static teal ring (shape, so it works without colour or
 * motion) plus, only under `pulse-motion`, a ring that breathes outwards. CSS only: no framer-motion in tiles that update
 * many times a second.
 */
export function SpeakingAvatar({ profile, speaking, size }: { profile: AvatarProfile; speaking: boolean; size: number }) {
  return (
    <span className="relative inline-flex rounded-full" data-speaking={speaking || undefined}>
      {speaking && <span aria-hidden data-pulse-ring="" className="absolute -inset-1.5 hidden rounded-full border-2 border-pulse-live pulse-motion:block pulse-motion:animate-pulse-ring" />}
      <Avatar profile={profile} size={size} speaking={speaking} />
    </span>
  );
}

/**
 * Mic, deafen, camera and connection as icons with words (`iconsOnly` keeps the words for screen readers, for the
 * narrow side rail). Deafened replaces the mic state; the camera and a weak connection only show when they apply.
 */
export function ParticipantStates({ micOn, deafened, video, poor, speaking, iconsOnly = false, className }: { micOn: boolean; deafened?: boolean; video: boolean; poor: boolean; speaking: boolean; iconsOnly?: boolean; className?: string }) {
  const states = [
    deafened ? { key: "deafened", icon: <HeadphoneOff className="text-pulse-alert" />, label: "Deafened" } : micOn ? { key: "mic", icon: <Mic />, label: speaking ? "Speaking" : "Mic on" } : { key: "mic", icon: <MicOff className="text-pulse-alert" />, label: "Muted" },
    video && { key: "video", icon: <Video />, label: "Camera on" },
    poor && { key: "poor", icon: <SignalLow className="text-pulse-alert" />, label: "Weak connection" },
  ].filter((s) => !!s);
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 font-pulse-text text-pulse-caption text-pulse-muted", className)}>
      {states.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1 [&_svg]:size-3.5 [&_svg]:shrink-0">
          <span aria-hidden className="inline-flex">{s.icon}</span>
          <span className={cn(iconsOnly && "sr-only")}>{s.label}</span>
        </li>
      ))}
    </ul>
  );
}
