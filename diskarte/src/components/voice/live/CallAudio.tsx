"use client";

import { RoomAudioRenderer, RoomContext, StartAudio } from "@livekit/components-react";
import type { Room } from "livekit-client";

/**
 * Plays every remote participant's audio; lazily loaded with the rest of the LiveKit UI. If the
 * browser blocks sound (e.g. after rejoining on a page reload, before you've clicked anything), a
 * button asks for one click to turn it on.
 */
export function CallAudio({ room, muted }: { room: Room; muted: boolean }) {
  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer room={room} muted={muted} />
      <StartAudio
        label="Click to turn on call audio"
        className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-sun px-4 py-2 text-sm font-bold text-abyss shadow-xl shadow-black/50"
      />
    </RoomContext.Provider>
  );
}
