"use client";

import { RoomContext, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useCall } from "../CallProvider";
import { ParticipantTile } from "./ParticipantTile";

function Grid() {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  return (
    <div className="scrollbar-thin grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] content-start gap-2 overflow-y-auto p-3" data-testid="call-grid">
      {tracks.map((t) => (
        <ParticipantTile key={`${t.participant.identity}:${t.source}`} trackRef={t} compact className={t.source === Track.Source.ScreenShare ? "col-span-full aspect-video" : "aspect-video"} />
      ))}
    </div>
  );
}

/**
 * The live call as a compact tile grid for the workspace's Voice panel (screen shares span the full
 * width). Controls live in the floating call overlay, so this is pure stage.
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
