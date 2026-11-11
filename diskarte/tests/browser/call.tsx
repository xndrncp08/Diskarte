import { useMemo, useState, type ReactNode } from "react";
import { CallContext, CallSpeakingContext, type CallContextValue } from "@/components/voice/CallProvider";
import { channels, server } from "../fixtures/server";
import { people } from "./database";

/**
 * A connected call for the browser fixture (localStorage `fixture:call`): "connected", "share" (Maria shares her screen),
 * "blocked" (the browser paused call sound) or "reconnecting". The room is a stand-in read by tests/browser/livekit.tsx.
 */
export type FixtureCall = "connected" | "share" | "blocked" | "reconnecting";

const VOICE = channels.find((c) => c.type === "voice")!;

function participant(index: number, extra: { isLocal?: boolean; micOn?: boolean; speaking?: boolean } = {}) {
  const p = {
    identity: people[index].id,
    name: people[index].display_name,
    isLocal: extra.isLocal ?? false,
    metadata: "",
    isMicrophoneEnabled: extra.micOn ?? true,
    connectionQuality: index === 2 ? "poor" : "excellent",
    fixtureSpeaking: extra.speaking ?? false,
    on: () => p,
    off: () => p,
  };
  return p;
}

export function FixtureCallProvider({ kind, children }: { kind: FixtureCall; children: ReactNode }) {
  const [state, setState] = useState({ muted: false, deafened: false, camera: false, screen: false, noiseSuppression: true, audioBlocked: kind === "blocked" });
  const room = useMemo(() => {
    const me = participant(0, { isLocal: true });
    const maria = participant(1, { speaking: true });
    const juan = participant(2, { micOn: false });
    const tracks = [me, maria, juan].map((p) => ({ participant: p, source: "camera" }));
    if (kind === "share") tracks.push({ participant: maria, source: "screen_share", publication: { isSubscribed: true, isMuted: false } } as never);
    return {
      localParticipant: me,
      remoteParticipants: new Map([maria, juan].map((p) => [p.identity, p])),
      fixtureTracks: tracks,
      on: () => undefined,
      off: () => undefined,
      startAudio: async () => setState((s) => ({ ...s, audioBlocked: false })),
    };
  }, [kind]);
  const value = useMemo<CallContextValue>(() => {
    const flip = (key: "muted" | "deafened" | "camera" | "screen" | "noiseSuppression") => async () => setState((s) => ({ ...s, [key]: !s[key] }));
    const none = async () => undefined;
    return {
      ...state,
      status: kind === "reconnecting" ? "reconnecting" : "connected",
      target: { serverId: server.id, serverName: server.name, channelId: VOICE.id, channelName: VOICE.name },
      quality: 4,
      room: room as unknown as CallContextValue["room"],
      join: none, prewarm: () => undefined, leave: () => undefined,
      toggleMute: flip("muted"), toggleDeafen: flip("deafened"), toggleCamera: flip("camera"), toggleScreen: flip("screen"), toggleNoiseSuppression: flip("noiseSuppression"),
      sendData: none, onData: () => () => undefined, mix: { master: 1, people: {} },
      setMasterVolume: () => undefined, setParticipantVolume: () => undefined, toggleLocalMute: () => undefined, toggleVideoOff: () => undefined,
      setStreamVolume: () => undefined, toggleStreamMute: () => undefined, switchDevice: none,
    };
  }, [state, kind, room]);
  return (
    <CallContext.Provider value={value}>
      <CallSpeakingContext.Provider value={[people[1].id]}>
        {children}
      </CallSpeakingContext.Provider>
    </CallContext.Provider>
  );
}
