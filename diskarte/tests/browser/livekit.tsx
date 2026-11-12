import { createContext, useContext } from "react";

/**
 * @livekit/components-react for the browser fixture, like tests/setup.ts's Vitest mock: the stage reads its tracks and
 * speakers from the fixture room (tests/browser/call.tsx). No WebRTC, no network.
 */
type FixtureParticipant = { identity: string; fixtureSpeaking?: boolean };
type FixtureTrack = { participant: FixtureParticipant; source: string; publication?: { isSubscribed: boolean; isMuted: boolean } };
export type TrackReferenceOrPlaceholder = FixtureTrack;

export const RoomContext = createContext<{ fixtureTracks: FixtureTrack[] } | null>(null);
export const useTracks = () => useContext(RoomContext)?.fixtureTracks ?? [];
export const useIsSpeaking = (participant?: FixtureParticipant) => !!participant?.fixtureSpeaking;
export const isTrackReference = (track: FixtureTrack) => !!track.publication;
export function VideoTrack({ className }: { className?: string }) {
  // A still "video": a gradient, so screenshots show where a camera or screen sits.
  return <div className={className} data-testid="video-track" style={{ background: "linear-gradient(135deg, #2cc8b4 0%, #24202b 60%, #ffb800 100%)", minHeight: 120 }} />;
}
export const RoomAudioRenderer = () => null;
export const StartAudio = () => null;
