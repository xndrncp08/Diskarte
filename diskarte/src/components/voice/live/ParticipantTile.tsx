"use client";

import { useIsSpeaking, VideoTrack, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { isTrackReference } from "@livekit/components-react";
import { ConnectionQuality, Track, type Participant } from "livekit-client";
import { MicOff, MonitorUp, VolumeX } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { UserAvatar, type AvatarProfile } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { ContextMenu, ContextMenuItems, useContextMenu } from "@/components/ui/ContextMenu";
import { cn } from "@/lib/utils";
import { CallContext, qualityToLevel } from "../CallProvider";

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
  // Right-click someone's stream: its sound has its own volume and mute, apart from their voice.
  const call = useContext(CallContext);
  const streamMenu = !!call && isScreen && !participant.isLocal;
  const menu = useContextMenu({ disabled: !streamMenu });
  const streamVolume = Math.round((call?.mix.streams?.[participant.identity] ?? 1) * 100);
  const streamMuted = !!call?.mix.streamMuted?.[participant.identity];

  return (
    <div
      {...(streamMenu ? menu.triggerProps : {})}
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
        <span className="truncate">{isScreen ? `${profile.name}'s screen` : profile.name}</span>
        {participant.isLocal && !isScreen && <span className="text-slate-400">(you)</span>}
      </div>
      {streamMenu && streamMuted && (
        <div className="absolute right-2 top-2 rounded bg-black/60 p-1" title="Stream muted">
          <VolumeX className="size-4 text-red-300" aria-label="Stream muted" />
        </div>
      )}
      {streamMenu && (
        <ContextMenu menu={menu} label={`${profile.name}'s stream`}>
          <ContextMenuItems
            items={[
              {
                label: `Stream Volume · ${streamVolume}%`,
                onSelect: () => undefined,
                control: (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    defaultValue={streamVolume}
                    onChange={(e) => call?.setStreamVolume(participant.identity, Number(e.target.value) / 100)}
                    aria-label={`Stream volume for ${profile.name}`}
                    className="w-full accent-sun"
                  />
                ),
              },
              { label: "Mute Stream", icon: <VolumeX className="size-4" aria-hidden />, multi: true, checked: streamMuted, onSelect: () => call?.toggleStreamMute(participant.identity) },
            ]}
          />
        </ContextMenu>
      )}
      {!isScreen && quality !== ConnectionQuality.Unknown && (
        <div className="absolute right-2 top-2 rounded bg-black/50 px-1 py-0.5">
          <SignalBars level={qualityToLevel(quality)} />
        </div>
      )}
    </div>
  );
}

/** A screen share you aren't watching: who's sharing and a Watch button (its video isn't downloaded until then). */
export function UnwatchedScreen({ trackRef, onWatch, className }: { trackRef: TrackReferenceOrPlaceholder; onWatch: () => void; className?: string }) {
  const who = useParticipantProfile(trackRef.participant);
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/60 p-3 text-center", className)} data-testid="unwatched-screen">
      <MonitorUp className="size-5 text-sun" aria-hidden />
      <p className="text-xs text-slate-300">
        <span className="font-semibold text-white">{who.name}</span> is sharing their screen
      </p>
      <button type="button" onClick={onWatch} className="rounded-lg bg-sun px-3 py-1 text-xs font-bold text-abyss transition-colors hover:bg-sun-deep">
        Watch
      </button>
    </div>
  );
}
