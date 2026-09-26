"use client";

import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import {
  ConnectionQuality,
  DisconnectReason,
  MediaDeviceFailure,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
  type LocalTrackPublication,
  type Participant,
} from "livekit-client";
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
  join: (target: CallTarget) => Promise<void>;
  leave: () => void;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
}

/** Exported for tests; app code uses <CallProvider> / useCall(). */
export const CallContext = createContext<CallContextValue | null>(null);
const NS_KEY = "diskarte:noise-suppression";

export function qualityToLevel(quality: ConnectionQuality): SignalLevel {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return 4;
    case ConnectionQuality.Good:
      return 3;
    case ConnectionQuality.Poor:
      return 1;
    case ConnectionQuality.Lost:
      return 0;
    default:
      return 2;
  }
}

function mediaErrorMessage(err: unknown, device: "mic" | "camera" | "screen") {
  const failure = MediaDeviceFailure.getFailure(err as Error);
  const what = device === "mic" ? "mikropono" : device === "camera" ? "camera" : "screen share";
  if (failure === MediaDeviceFailure.PermissionDenied || (err as Error)?.name === "NotAllowedError") return `Walang permiso sa ${what}. I-allow sa browser settings.`;
  if (failure === MediaDeviceFailure.NotFound) return `Walang nakitang ${what}.`;
  if (failure === MediaDeviceFailure.DeviceInUse) return `Gamit ng ibang app ang ${what}.`;
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
 * servers. Exposes the room through LiveKit's RoomContext for @livekit/components-react hooks.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  // Only rendered once a call starts (client-side), so reading localStorage here cannot cause a hydration mismatch.
  const [state, setState] = useState<CallState>(() => ({ ...IDLE, noiseSuppression: readNoiseSuppression() }));
  const [room, setRoom] = useState<Room | null>(null);
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

      const ns = readNoiseSuppression();
      const next = new Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: ns, autoGainControl: true },
        videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        publishDefaults: { simulcast: true, screenShareEncoding: ScreenSharePresets.h1080fps15.encoding, dtx: true, red: true },
      });

      next
        .on(RoomEvent.ParticipantConnected, () => playSfx("join"))
        .on(RoomEvent.ParticipantDisconnected, () => playSfx("leave"))
        .on(RoomEvent.Reconnecting, () => setState((s) => ({ ...s, status: "reconnecting", quality: 1 })))
        .on(RoomEvent.Reconnected, () => setState((s) => ({ ...s, status: "connected" })))
        .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
          if (participant.isLocal) setState((s) => ({ ...s, quality: qualityToLevel(quality) }));
        })
        .on(RoomEvent.LocalTrackUnpublished, (publication: LocalTrackPublication) => {
          // Browser "Stop sharing" button or a revoked camera.
          if (publication.source === Track.Source.ScreenShare) setState((s) => ({ ...s, screen: false }));
          if (publication.source === Track.Source.Camera) setState((s) => ({ ...s, camera: false }));
        })
        .on(RoomEvent.MediaDevicesError, (err: Error) => toast.error(mediaErrorMessage(err, "mic")))
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (roomRef.current !== next) return;
          if (!leaving.current) {
            playSfx("leave");
            toast(reason === DisconnectReason.DUPLICATE_IDENTITY ? "Nag-join ka sa voice mula sa ibang tab." : "Na-disconnect ka sa voice.");
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
    const mic = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
    if (mic && "restartTrack" in mic) {
      await (mic as { restartTrack: (o: MediaTrackConstraints) => Promise<void> })
        .restartTrack({ noiseSuppression: enabled, echoCancellation: true, autoGainControl: true })
        .catch(() => toast.error("Hindi ma-apply ang noise suppression."));
    }
    toast(enabled ? "Noise suppression: ON 🎧" : "Noise suppression: OFF");
  }, [state.noiseSuppression]);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  const value = useMemo<CallContextValue>(
    () => ({ ...state, room, join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, toggleNoiseSuppression }),
    [state, room, join, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, toggleNoiseSuppression],
  );

  return (
    <CallContext.Provider value={value}>
      <RoomContext.Provider value={room ?? undefined}>
        {children}
        {room && state.status !== "idle" && <RoomAudioRenderer room={room} muted={state.deafened} />}
      </RoomContext.Provider>
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall must be used inside <CallProvider>");
  return value;
}
