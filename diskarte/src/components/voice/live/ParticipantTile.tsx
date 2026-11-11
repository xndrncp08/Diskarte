"use client";

import { useIsSpeaking, VideoTrack, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { isTrackReference } from "@livekit/components-react";
import { ConnectionQuality, Track, type Participant } from "livekit-client";
import { MicOff, MonitorUp, VolumeX } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { Button } from "@/components/pulse/Button";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { useShellKind } from "@/components/shell/ShellKind";
import { ContextMenu, ContextMenuItems, useContextMenu } from "@/components/ui/ContextMenu";
import { cn } from "@/lib/utils";
import { CallContext, qualityToLevel } from "../CallProvider";
import { useParticipantProfile } from "../participant-profile";
import { ParticipantStates, SpeakingAvatar } from "../pulse/people";

export { useParticipantProfile };

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

/**
 * One person (camera or placeholder) or one screen share on the call stage. Classic: a 16:9 tile with a name pill. Pulse:
 * a card on the stage surface, the avatar with the speaking ring (or their video), then their name and mic / deafen /
 * camera / connection as labelled icons under it, never over the picture. `deafened` comes from voice presence (LiveKit
 * doesn't know it), so it's only shown where the stage has it.
 */
export function ParticipantTile({ trackRef, className, compact = false, deafened }: { trackRef: TrackReferenceOrPlaceholder; className?: string; compact?: boolean; deafened?: boolean }) {
  const participant = trackRef.participant;
  const profile = useParticipantProfile(participant);
  const speaking = useIsSpeaking(participant);
  const { micOn, quality } = useParticipantState(participant);
  const pulse = useShellKind() === "pulse";
  const isScreen = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && trackRef.publication?.isSubscribed !== false && !trackRef.publication?.isMuted;
  // Right-click someone's stream: its sound has its own volume and mute, apart from their voice.
  const call = useContext(CallContext);
  const streamMenu = !!call && isScreen && !participant.isLocal;
  const menu = useContextMenu({ disabled: !streamMenu });
  const streamVolume = Math.round((call?.mix.streams?.[participant.identity] ?? 1) * 100);
  const streamMuted = !!call?.mix.streamMuted?.[participant.identity];
  const streamMenuNode = streamMenu && (
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
  );

  if (pulse)
    return (
      <div
        {...(streamMenu ? menu.triggerProps : {})}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden rounded-pulse-card border bg-pulse-surface font-pulse-text text-pulse-text shadow-pulse-1",
          speaking && !isScreen ? "border-pulse-live" : "border-pulse-line",
          className,
        )}
        data-testid="participant-card"
        data-speaking={speaking || undefined}
      >
        {hasVideo ? (
          <div className={cn("relative min-h-0 flex-1 bg-pulse-code", !isScreen && "aspect-video")}>
            <VideoTrack trackRef={trackRef} className={cn("size-full", isScreen ? "object-contain" : "object-cover")} />
          </div>
        ) : (
          <div className={cn("flex min-h-0 flex-1 items-center justify-center", compact ? "pt-3" : "pt-6 pb-1")}>
            <SpeakingAvatar profile={profile} speaking={speaking && !isScreen} size={compact ? 44 : 72} />
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col gap-0.5", compact ? "px-2.5 py-2" : "px-3 pb-3 pt-2", !hasVideo && "items-center text-center")}>
          <p className="flex min-w-0 max-w-full items-center gap-1.5 text-pulse-label font-semibold">
            {isScreen && <MonitorUp className="size-4 shrink-0 text-pulse-live" aria-hidden />}
            <span className="truncate">{isScreen ? `${profile.name}'s screen` : profile.name}</span>
            {participant.isLocal && !isScreen && <span className="shrink-0 font-normal text-pulse-muted">(you)</span>}
            {streamMenu && streamMuted && <VolumeX className="size-4 shrink-0 text-pulse-alert" aria-label="Stream muted" />}
          </p>
          {!isScreen && (
            <ParticipantStates
              micOn={micOn}
              deafened={deafened}
              video={hasVideo}
              poor={quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost}
              speaking={speaking}
              iconsOnly={compact}
              className={cn(!hasVideo && "justify-center")}
            />
          )}
        </div>
        {streamMenuNode}
      </div>
    );

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
      {streamMenuNode}
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
  if (useShellKind() === "pulse")
    return (
      <div className={cn("flex min-w-0 flex-col items-center justify-center gap-2 rounded-pulse-card border border-dashed border-pulse-line-strong bg-pulse-surface p-3 text-center font-pulse-text", className)} data-testid="unwatched-screen">
        <MonitorUp className="size-5 text-pulse-live" aria-hidden />
        <p className="text-pulse-label text-pulse-muted">
          <span className="font-semibold text-pulse-text">{who.name}</span> is sharing their screen
        </p>
        <Button size="sm" onClick={onWatch}>
          Watch
        </Button>
      </div>
    );
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
