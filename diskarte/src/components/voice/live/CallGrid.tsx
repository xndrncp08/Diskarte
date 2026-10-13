"use client";

import { RoomContext, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useCall } from "../CallProvider";
import { ParticipantTile, UnwatchedScreen } from "./ParticipantTile";
import { trackKey, useScreenWatch } from "./useScreenWatch";

function Grid() {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  const screens = tracks.filter((t) => t.source === Track.Source.ScreenShare);
  const { watched, watch } = useScreenWatch(screens);
  return (
    <div className="scrollbar-thin grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] content-start gap-2 overflow-y-auto p-3" data-testid="call-grid">
      {tracks.map((t) =>
        t.source !== Track.Source.ScreenShare ? (
          <ParticipantTile key={trackKey(t)} trackRef={t} compact className="aspect-video" />
        ) : t === watched ? (
          <ParticipantTile key={trackKey(t)} trackRef={t} compact className="col-span-full aspect-video" />
        ) : (
          <UnwatchedScreen key={trackKey(t)} trackRef={t} onWatch={() => watch(trackKey(t))} className="aspect-video" />
        ),
      )}
    </div>
  );
}

/**
 * The live call as a compact tile grid for the workspace's Voice panel (the screen share you watch
 * spans the full width; others wait behind a Watch button). Controls live in the floating call overlay, so this is pure stage.
 */
export function CallGrid() {
  const { room } = useCall();
  if (!room) return null;
  return (
    <RoomContext.Provider value={room}>
      <Grid />
    </RoomContext.Provider>
  );
}
