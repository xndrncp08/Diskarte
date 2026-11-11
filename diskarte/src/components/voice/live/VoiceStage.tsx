"use client";

import { RoomContext, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { EyeOff, Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { bestGrid } from "@/lib/voice-layout";
import { cn } from "@/lib/utils";
import { ActivitiesMenu, ActivityStage } from "./activities/ActivityStage";
import { useActivity } from "./activities/useActivity";
import { ParticipantTile, UnwatchedScreen } from "./ParticipantTile";
import { SoundboardPanel } from "./SoundboardPanel";
import { trackKey, useScreenWatch } from "./useScreenWatch";
import { useCall } from "../CallProvider";
import { VoiceControls } from "../VoiceControls";
import { MixerButton } from "../AudioMixer";
import { useShellKind } from "@/components/shell/ShellKind";
import { useChannelVoicePresence } from "@/hooks/useVoiceRoster";
import { CallRecovery } from "../pulse/CallRecovery";
import { CallControls } from "../pulse/controls";
import type { ActivityControls } from "./activities/useActivity";
import { useModalBehaviour } from "@/components/ui/Modal";

/**
 * The Pulse stage: people as cards on the canvas (avatar with the speaking ring, or their camera; name and state under it),
 * centred and capped in width rather than stretched into 16:9 tiles. A watched screen share is featured with everyone in a
 * side rail (a row on phones). Recovery states sit on top, the labelled control dock stays at the bottom while you scroll.
 */
function PulseStage({ cameras, watched, unwatched, watch, activity }: { cameras: TrackReferenceOrPlaceholder[]; watched?: TrackReferenceOrPlaceholder; unwatched: TrackReferenceOrPlaceholder[]; watch: (key: string | null) => void; activity: ActivityControls }) {
  const call = useCall();
  // Deafened isn't a LiveKit state: voice presence carries it (a private room's own topic, see useChannelVoicePresence).
  const presence = useChannelVoicePresence(call.target?.kind === "dm" ? null : call.target?.channelId);
  const deafened = (t: TrackReferenceOrPlaceholder) => (t.participant.isLocal ? call.deafened : presence.get(t.participant.identity)?.deafened);
  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 font-pulse-text md:p-5" data-testid="pulse-voice-stage">
      <CallRecovery prompt="all" />
      <ActivityStage controls={activity} />
      {watched ? (
        <div className="flex min-h-64 flex-1 flex-col gap-3 lg:flex-row">
          <FocusableScreen key={trackKey(watched)} trackRef={watched} onStop={() => watch(null)} />
          <ul aria-label="People in the call" className="scrollbar-thin flex shrink-0 gap-3 overflow-x-auto pb-1 lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0">
            {unwatched.map((t) => (
              <li key={trackKey(t)} className="w-40 shrink-0 lg:w-full">
                <UnwatchedScreen trackRef={t} onWatch={() => watch(trackKey(t))} className="h-full" />
              </li>
            ))}
            {cameras.map((t) => (
              <li key={trackKey(t)} className="w-36 shrink-0 lg:w-full">
                <ParticipantTile trackRef={t} compact deafened={deafened(t)} className="h-full" />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul aria-label="People in the call" className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),15rem))] content-center justify-center gap-3">
          {unwatched.map((t) => (
            <li key={trackKey(t)}>
              <UnwatchedScreen trackRef={t} onWatch={() => watch(trackKey(t))} className="h-full min-h-40" />
            </li>
          ))}
          {cameras.map((t) => (
            <li key={trackKey(t)}>
              <ParticipantTile trackRef={t} deafened={deafened(t)} className="h-full" />
            </li>
          ))}
        </ul>
      )}
      <div className="pb-safe sticky bottom-0 flex justify-center">
        <div className="max-w-full rounded-pulse-card border border-pulse-line bg-pulse-raised p-1.5 shadow-pulse-2">
          <CallControls layout="dock" extras={<><SoundboardPanel /><ActivitiesMenu controls={activity} /></>} />
        </div>
      </div>
    </div>
  );
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Screen share "focus mode": true fullscreen where the Fullscreen API exists, otherwise (iOS
 * Safari) a fixed full-viewport overlay. Escape leaves either.
 */
function FocusableScreen({ trackRef, onStop }: { trackRef: TrackReferenceOrPlaceholder; onStop: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useModalBehaviour(overlay, box, () => setOverlay(false));

  const toggle = useCallback(async () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) return void (await document.exitFullscreen().catch(() => undefined));
    if (overlay) return setOverlay(false);
    if (typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch {
        // Fall through to the overlay.
      }
    }
    setOverlay(true);
  }, [overlay]);

  const focused = native || overlay;
  const pulse = useShellKind() === "pulse";
  // Pulse: raised Pulse buttons (Classic's white-on-black would turn dark-on-black under the Classic bridge in paper mode).
  const tool = pulse
    ? "flex min-h-8 items-center gap-1.5 rounded-pulse-control border border-pulse-line bg-pulse-raised px-2.5 font-pulse-text text-pulse-caption font-semibold text-pulse-text shadow-pulse-1 hover:bg-pulse-surface pointer-coarse:min-h-11"
    : "flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/90";
  return (
    <div ref={box} role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined} aria-label={overlay ? "Screen share" : undefined} className={cn("group/screen relative min-h-0 flex-1", pulse ? "bg-pulse-code rounded-pulse-card" : "bg-black", overlay && "fixed inset-0 z-50", focused && "flex rounded-none")} data-testid="screen-focus" data-focused={focused || undefined}>
      <ParticipantTile trackRef={trackRef} className={cn("size-full", focused && "rounded-none border-0")} />
      <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/screen:opacity-100 pointer-coarse:opacity-100">
        {!focused && (
          <button type="button" onClick={onStop} className={tool}>
            <EyeOff className="size-4" aria-hidden /> Stop watching
          </button>
        )}
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={focused ? "Exit focus mode" : "Focus mode (fullscreen)"}
          className={tool}
        >
          {focused ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
          {focused ? "Exit" : "Focus"}
        </button>
      </div>
    </div>
  );
}

/** Lazily loaded with LiveKit's React bindings; scopes them to the active room. */
export function VoiceStage() {
  const { room } = useCall();
  if (!room) return null;
  return (
    <RoomContext.Provider value={room}>
      <Stage />
    </RoomContext.Provider>
  );
}

/** Live call stage: adaptive camera grid, or focus layout (screen + filmstrip) when someone shares. */
function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);
  const { watched, watch } = useScreenWatch(screens);
  const unwatched = screens.filter((s) => s !== watched);
  const [gridRef, size] = useSize<HTMLDivElement>();
  const grid = bestGrid(cameras.length + (watched ? 0 : unwatched.length), size.width, size.height);
  const activity = useActivity();
  const pulse = useShellKind() === "pulse";
  if (pulse) return <PulseStage cameras={cameras} watched={watched} unwatched={unwatched} watch={watch} activity={activity} />;

  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="voice-stage">
      <ActivityStage controls={activity} />
      {watched ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <FocusableScreen key={trackKey(watched)} trackRef={watched} onStop={() => watch(null)} />
          <div className="scrollbar-thin flex shrink-0 gap-3 overflow-auto lg:w-56 lg:flex-col">
            {unwatched.map((t) => (
              <UnwatchedScreen key={trackKey(t)} trackRef={t} onWatch={() => watch(trackKey(t))} className="aspect-video w-48 shrink-0 lg:w-full" />
            ))}
            {cameras.map((t) => (
              <div key={trackKey(t)} className="aspect-video w-48 shrink-0 lg:w-full">
                <ParticipantTile trackRef={t} compact className="size-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div ref={gridRef} className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3">
          {unwatched.map((t) => (
            <div key={trackKey(t)} style={{ width: grid.tileWidth || undefined, aspectRatio: "16 / 9" }} className="min-w-40">
              <UnwatchedScreen trackRef={t} onWatch={() => watch(trackKey(t))} className="size-full" />
            </div>
          ))}
          {cameras.map((t) => (
            <div key={trackKey(t)} style={{ width: grid.tileWidth || undefined, aspectRatio: "16 / 9" }} className="min-w-40">
              <ParticipantTile trackRef={t} className="size-full" />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-center">
        <div className="voice-stage-controls glass pb-safe flex max-w-full flex-wrap items-start justify-center gap-1.5 rounded-3xl px-2 pt-3 sm:gap-3 sm:px-4">
          <VoiceControls />
          <div className="flex gap-1.5 sm:gap-3" role="toolbar" aria-label="Call extras">
            <SoundboardPanel />
            <ActivitiesMenu controls={activity} />
            <MixerButton />
          </div>
        </div>
      </div>
    </div>
  );
}
