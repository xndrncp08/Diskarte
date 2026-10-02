"use client";

import { RoomContext, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { bestGrid } from "@/lib/voice-layout";
import { cn } from "@/lib/utils";
import { ActivitiesMenu, ActivityStage } from "./activities/ActivityStage";
import { useActivity } from "./activities/useActivity";
import { ParticipantTile } from "./ParticipantTile";
import { SoundboardPanel } from "./SoundboardPanel";
import { useCall } from "../CallProvider";
import { VoiceControls } from "../VoiceControls";
import { MixerButton } from "../AudioMixer";

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

const trackKey = (t: TrackReferenceOrPlaceholder) => `${t.participant.identity}:${t.source}`;

/**
 * Screen share "focus mode": true fullscreen where the Fullscreen API exists, otherwise (iOS
 * Safari) a fixed full-viewport overlay. Escape leaves either.
 */
function FocusableScreen({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const box = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOverlay(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay]);

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
  return (
    <div ref={box} className={cn("group/screen relative min-h-0 flex-1 bg-black", overlay && "fixed inset-0 z-50", focused && "flex")} data-testid="screen-focus" data-focused={focused || undefined}>
      <ParticipantTile trackRef={trackRef} className={cn("size-full", focused && "rounded-none border-0")} />
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={focused ? "Exit focus mode" : "Focus mode (fullscreen)"}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/70 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 backdrop-blur transition-opacity hover:bg-black/90 focus:opacity-100 group-hover/screen:opacity-100 pointer-coarse:opacity-100"
      >
        {focused ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
        {focused ? "Exit" : "Focus"}
      </button>
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
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [gridRef, size] = useSize<HTMLDivElement>();

  const focused = screens.find((s) => trackKey(s) === focusKey) ?? screens[0];
  const grid = bestGrid(cameras.length, size.width, size.height);
  const activity = useActivity();

  return (
    <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="voice-stage">
      <ActivityStage controls={activity} />
      {focused ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <FocusableScreen key={trackKey(focused)} trackRef={focused} />
          <div className="scrollbar-thin flex shrink-0 gap-3 overflow-auto lg:w-56 lg:flex-col">
            {[...screens.filter((s) => s !== focused), ...cameras].map((t) => (
              <button key={trackKey(t)} type="button" onClick={() => t.source === Track.Source.ScreenShare && setFocusKey(trackKey(t))} className="aspect-video w-48 shrink-0 lg:w-full">
                <ParticipantTile trackRef={t} compact className="size-full" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={gridRef} className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3">
          {cameras.map((t) => (
            <div key={trackKey(t)} style={{ width: grid.tileWidth || undefined, aspectRatio: "16 / 9" }} className="min-w-40">
              <ParticipantTile trackRef={t} className="size-full" />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-center">
        <div className="glass pb-safe flex max-w-full flex-wrap items-start justify-center gap-1.5 rounded-3xl px-2 pt-3 sm:gap-3 sm:px-4">
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
