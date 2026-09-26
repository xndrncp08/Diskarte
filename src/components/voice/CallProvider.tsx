"use client";

import type { ConnectionQuality, DisconnectReason, LocalTrackPublication, Participant, Room } from "livekit-client";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerPresence, useVoicePresence } from "@/components/providers/PresenceProvider";
import type { SignalLevel } from "@/components/retro/SignalBars";
import { playSfx } from "@/lib/sfx";

export type CallStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface CallTarget {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
}

export interface CallState {
  status: CallStatus;
  target: CallTarget | null;
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  screen: boolean;
  noiseSuppression: boolean;
  quality: SignalLevel;
}

export interface CallContextValue extends CallState {
  room: Room | null;
  /** Identities LiveKit currently reports as speaking (active speaker detection). */
  speaking: string[];
  join: (target: CallTarget) => Promise<void>;
  leave: () => void;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
}

/**
 * LiveKit's SDK (~650 KB) is only fetched when someone actually joins voice. Everything that needs
 * `@livekit/components-react` lives in lazily loaded modules under ./live.
 */
let livekitModule: Promise<typeof import("livekit-client")> | null = null;
export function loadLivekit() {
  livekitModule ??= import("livekit-client");
  return livekitModule;
}

const CallAudio = dynamic(() => import("./live/CallAudio").then((m) => m.CallAudio), { ssr: false });

/** Exported for tests; app code uses <CallProvider> / useCall(). */
export const CallContext = createContext<CallContextValue | null>(null);
const NS_KEY = "diskarte:noise-suppression";

export function qualityToLevel(quality: ConnectionQuality | string): SignalLevel {
  switch (quality) {
    case "excellent":
      return 4;
    case "good":
      return 3;
    case "poor":
      return 1;
    case "lost":
      return 0;
    default:
      return 2;
  }
}

export function mediaErrorMessage(err: unknown, device: "mic" | "camera" | "screen") {
  const name = (err as Error | undefined)?.name ?? "";
  const what = device === "mic" ? "mikropono" : device === "camera" ? "camera" : "screen share";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return `Walang permiso sa ${what}. I-allow sa browser settings.`;
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) return `Walang nakitang ${what}.`;
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) return `Gamit ng ibang app ang ${what}.`;
  return `Hindi ma-on ang ${what}.`;
}

function readNoiseSuppression() {
  try {
    return localStorage.getItem(NS_KEY) !== "off";
  } catch {
    return true;
  }
}

const IDLE: CallState = { status: "idle", target: null, muted: false, deafened: false, camera: false, screen: false, noiseSuppression: true, quality: 4 };

/**
 * Owns the LiveKit room for the whole app shell so a call survives navigation between channels and
 * servers. Components that need LiveKit's React hooks wrap themselves in RoomContext (see ./live).
 */
export function CallProvider({ children }: { children: ReactNode }) {
  // Only rendered once a call starts (client-side), so reading localStorage here cannot cause a hydration mismatch.
  const [state, setState] = useState<CallState>(() => ({ ...IDLE, noiseSuppression: readNoiseSuppression() }));
  const [room, setRoom] = useState<Room | null>(null);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const roomRef = useRef<Room | null>(null);
  const leaving = useRef(false);
  const mutedBeforeDeafen = useRef(false);
  const setVoice = useVoicePresence();

  // Keep the presence channel for the call's server open even while browsing other servers.
  useServerPresence(state.target?.serverId);

  // Mirror call state into presence so sidebars show who is in which voice channel.
  useEffect(() => {
    if ((state.status === "connected" || state.status === "reconnecting") && state.target) {
      setVoice({ serverId: state.target.serverId, channelId: state.target.channelId, muted: state.muted, deafened: state.deafened, video: state.camera, screen: state.screen });
    } else {
      setVoice(null);
    }
  }, [state.status, state.target, state.muted, state.deafened, state.camera, state.screen, setVoice]);

  const teardown = useCallback(() => {
    roomRef.current?.removeAllListeners();
    roomRef.current = null;
    setRoom(null);
    setSpeaking([]);
    setState((s) => ({ ...IDLE, noiseSuppression: s.noiseSuppression }));
  }, []);

  const leave = useCallback(() => {
    const current = roomRef.current;
    if (!current) return;
    leaving.current = true;
    playSfx("leave");
    void current.disconnect();
    teardown();
  }, [teardown]);

  const join = useCallback(
    async (target: CallTarget) => {
      if (roomRef.current && state.target?.channelId === target.channelId) return;
      if (roomRef.current) leave();
      leaving.current = false;
      setState((s) => ({ ...s, status: "connecting", target, camera: false, screen: false }));

      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: target.channelId }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { token?: string; url?: string; error?: string } | null;
      if (!res?.ok || !body?.token || !body.url) {
        playSfx("error");
        toast.error(body?.error ?? "Hindi maka-connect sa voice. Subukan ulit.");
        setState((s) => ({ ...IDLE, noiseSuppression: s.noiseSuppression }));
        return;
      }

      const lk = await loadLivekit();
      const ns = readNoiseSuppression();
      const next = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: ns, autoGainControl: true },
        videoCaptureDefaults: { resolution: lk.VideoPresets.h720.resolution },
        publishDefaults: { simulcast: true, screenShareEncoding: lk.ScreenSharePresets.h1080fps15.encoding, dtx: true, red: true },
      });

      next
        .on(lk.RoomEvent.ParticipantConnected, () => playSfx("join"))
        .on(lk.RoomEvent.ParticipantDisconnected, () => playSfx("leave"))
        .on(lk.RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => setSpeaking(speakers.map((p) => p.identity)))
        .on(lk.RoomEvent.Reconnecting, () => setState((s) => ({ ...s, status: "reconnecting", quality: 1 })))
        .on(lk.RoomEvent.Reconnected, () => setState((s) => ({ ...s, status: "connected" })))
        .on(lk.RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
          if (participant.isLocal) setState((s) => ({ ...s, quality: qualityToLevel(quality) }));
        })
        .on(lk.RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
          // Browser "Stop sharing" button or a revoked camera.
          if (publication.source === lk.Track.Source.ScreenShare) setState((s) => ({ ...s, screen: false }));
          if (publication.source === lk.Track.Source.Camera) setState((s) => ({ ...s, camera: false }));
        })
        .on(lk.RoomEvent.MediaDevicesError, (err: Error) => toast.error(mediaErrorMessage(err, "mic")))
        .on(lk.RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (roomRef.current !== next) return;
          if (!leaving.current) {
            playSfx("leave");
            toast(reason === (lk.DisconnectReason.DUPLICATE_IDENTITY as DisconnectReason) ? "Nag-join ka sa voice mula sa ibang tab." : "Na-disconnect ka sa voice.");
          }
          teardown();
        });

      roomRef.current = next;
      setRoom(next);
      try {
        await next.connect(body.url, body.token, { autoSubscribe: true });
      } catch {
        if (roomRef.current === next) {
          playSfx("error");
          toast.error("Hindi maka-connect sa voice server.");
          teardown();
        }
        return;
      }
      if (roomRef.current !== next) return;
      playSfx("join");
      setState((s) => ({ ...s, status: "connected", noiseSuppression: ns, muted: false, deafened: false }));
      try {
        await next.localParticipant.setMicrophoneEnabled(true);
      } catch (err) {
        toast.error(mediaErrorMessage(err, "mic"));
        setState((s) => ({ ...s, muted: true }));
      }
    },
    [leave, teardown, state.target?.channelId],
  );

  const toggleMute = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    const unmuting = state.muted || state.deafened;
    try {
      await current.localParticipant.setMicrophoneEnabled(unmuting);
      playSfx(unmuting ? "unmute" : "mute");
      setState((s) => ({ ...s, muted: !unmuting, deafened: unmuting ? false : s.deafened }));
    } catch (err) {
      toast.error(mediaErrorMessage(err, "mic"));
    }
  }, [state.muted, state.deafened]);

  const toggleDeafen = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    if (!state.deafened) {
      mutedBeforeDeafen.current = state.muted;
      await current.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      playSfx("deafen");
      setState((s) => ({ ...s, deafened: true, muted: true }));
    } else {
      const restoreMic = !mutedBeforeDeafen.current;
      if (restoreMic) await current.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
      playSfx("unmute");
      setState((s) => ({ ...s, deafened: false, muted: !restoreMic }));
    }
  }, [state.deafened, state.muted]);

  const toggleCamera = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    try {
      await current.localParticipant.setCameraEnabled(!state.camera);
      setState((s) => ({ ...s, camera: !s.camera }));
    } catch (err) {
      toast.error(mediaErrorMessage(err, "camera"));
    }
  }, [state.camera]);

  const toggleScreen = useCallback(async () => {
    const current = roomRef.current;
    if (!current) return;
    try {
      await current.localParticipant.setScreenShareEnabled(!state.screen, { audio: true, selfBrowserSurface: "exclude", surfaceSwitching: "include" });
      setState((s) => ({ ...s, screen: !s.screen }));
    } catch (err) {
      if ((err as Error)?.name !== "NotAllowedError") toast.error(mediaErrorMessage(err, "screen"));
    }
  }, [state.screen]);

  const toggleNoiseSuppression = useCallback(async () => {
    const enabled = !state.noiseSuppression;
    try {
      localStorage.setItem(NS_KEY, enabled ? "on" : "off");
    } catch {
      // ignore storage failures
    }
    setState((s) => ({ ...s, noiseSuppression: enabled }));
    const mic = roomRef.current?.localParticipant.getTrackPublication("microphone" as Parameters<Room["localParticipant"]["getTrackPublication"]>[0])?.audioTrack;
    if (mic && "restartTrack" in mic) {
      await (mic as { restartTrack: (o: MediaTrackConstraints) => Promise<void> })
        .restartTrack({ noiseSuppression: enabled, echoCancellation: true, autoGainControl: true })
        .catch(() => toast.error("Hindi ma-apply ang noise suppression."));
    }
    toast(enabled ? "Noise suppression: ON 🎧" : "Noise suppression: OFF");
  }, [state.noiseSuppression]);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  const value = useMemo<CallContextValue>(
    () => ({ ...state, room, speaking, join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, toggleNoiseSuppression }),
    [state, room, speaking, join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, toggleNoiseSuppression],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {room && state.status !== "idle" && <CallAudio room={room} muted={state.deafened} />}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall must be used inside <CallProvider>");
  return value;
}
