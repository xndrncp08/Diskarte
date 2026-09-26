"use client";

import { useIsSpeaking, VideoTrack, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { isTrackReference } from "@livekit/components-react";
import { ConnectionQuality, Track, type Participant } from "livekit-client";
import { MicOff, MonitorUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { UserAvatar, type AvatarProfile } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { cn } from "@/lib/utils";
import { qualityToLevel } from "../CallProvider";

/** Resolve a participant (identity = user id) to a profile: Tambayan members first, token metadata second. */
export function useParticipantProfile(participant: Participant): AvatarProfile & { name: string } {
  const server = useOptionalServer();
  const member = server?.members.find((m) => m.user_id === participant.identity);
  if (member) return { ...member.profile, name: member.nickname ?? member.profile.display_name };
  let meta: { avatar_url?: string | null; avatar_preset?: string } = {};
  try {
    meta = participant.metadata ? JSON.parse(participant.metadata) : {};
  } catch {
    meta = {};
  }
  const name = participant.name || participant.identity;
  return { display_name: name, name, avatar_url: meta.avatar_url ?? null, avatar_preset: meta.avatar_preset ?? "araw" };
}

function useParticipantState(participant: Participant) {
  const read = () => ({ micOn: participant.isMicrophoneEnabled, quality: participant.connectionQuality });
  const [state, setState] = useState(read);
  useEffect(() => {
    const update = () => setState({ micOn: participant.isMicrophoneEnabled, quality: participant.connectionQuality });
    // Tiles are keyed per participant, so the initial read() is current; listen for changes only.
    participant.on("trackMuted", update).on("trackUnmuted", update).on("trackPublished", update).on("trackUnpublished", update).on("connectionQualityChanged", update);
    return () => {
      participant.off("trackMuted", update).off("trackUnmuted", update).off("trackPublished", update).off("trackUnpublished", update).off("connectionQualityChanged", update);
    };
  }, [participant]);
  return state;
}

export function ParticipantTile({ trackRef, className, compact = false }: { trackRef: TrackReferenceOrPlaceholder; className?: string; compact?: boolean }) {
  const participant = trackRef.participant;
  const profile = useParticipantProfile(participant);
  const speaking = useIsSpeaking(participant);
  const { micOn, quality } = useParticipantState(participant);
  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && trackRef.publication?.isSubscribed !== false && !trackRef.publication?.isMuted;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-midnight/80 backdrop-blur-md transition-shadow duration-150",
        speaking && !isScreen ? "neon-speaking" : "shadow-[0_0_0_1px_rgb(255_255_255_/_0.06)]",
        className,
      )}
      data-testid="participant-tile"
      data-speaking={speaking || undefined}
    >
      {hasVideo ? (
        <VideoTrack trackRef={trackRef} className={cn("size-full", isScreen ? "object-contain bg-black" : "object-cover")} />
      ) : (
        <div className="scanlines flex size-full items-center justify-center">
          <UserAvatar profile={profile} size={compact ? 44 : 88} speaking={speaking} />
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
        {isScreen && <MonitorUp className="size-3.5 shrink-0 text-sun" aria-hidden />}
        {!isScreen && !micOn && <MicOff className="size-3.5 shrink-0 text-red-400" aria-label="Muted" />}
        <span className="truncate">{isScreen ? `Screen ni ${profile.name}` : profile.name}</span>
        {participant.isLocal && !isScreen && <span className="text-slate-400">(ikaw)</span>}
      </div>
      {!isScreen && quality !== ConnectionQuality.Unknown && (
        <div className="absolute right-2 top-2 rounded bg-black/50 px-1 py-0.5">
          <SignalBars level={qualityToLevel(quality)} />
        </div>
      )}
    </div>
  );
}
