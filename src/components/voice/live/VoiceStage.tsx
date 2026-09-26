"use client";

import { RoomContext, useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { bestGrid } from "@/lib/voice-layout";
import { ParticipantTile } from "./ParticipantTile";
import { useCall } from "../CallProvider";
import { VoiceControls } from "../VoiceControls";

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4" data-testid="voice-stage">
      {focused ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <ParticipantTile trackRef={focused} className="min-h-0 flex-1" />
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
        <div className="glass rounded-3xl px-4 py-3">
          <VoiceControls />
        </div>
      </div>
    </div>
  );
}
