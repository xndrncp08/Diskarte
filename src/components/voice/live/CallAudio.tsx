"use client";

import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";

/** Plays every remote participant's audio; lazily loaded with the rest of the LiveKit UI. */
export function CallAudio({ room, muted }: { room: Room; muted: boolean }) {
  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer room={room} muted={muted} />
    </RoomContext.Provider>
  );
}
