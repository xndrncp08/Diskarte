"use client";

import type { ConnectionQuality, DisconnectReason, LocalTrackPublication, Participant, RemoteParticipant, RemoteTrackPublication, Room } from "livekit-client";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useBroadcastSpeaking, useServerPresence, useVoicePresence } from "@/components/providers/PresenceProvider";
import type { SignalLevel } from "@/components/retro/SignalBars";
import { getLowDataMode, subscribeLowDataMode } from "@/lib/low-data";
import { playSfx } from "@/lib/sfx";

export type CallStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface CallTarget {
  /** "dm": a 1:1 / group DM call — channelId is the conversation id and serverId is empty. */
  kind?: "channel" | "dm";
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
}

/** Where the "back to call" links go. */
export function callHref(target: CallTarget) {
  return target.kind === "dm" ? `/tambayan/dm/${target.channelId}` : `/tambayan/${target.serverId}/${target.channelId}`;
}

export type DataHandler = (payload: unknown, fromIdentity: string | null) => void;

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
  /** Warm up a likely join (hover/focus on a voice channel): load the SDK and mint a token ahead of time. */
  prewarm: (target: CallTarget) => void;
  leave: () => void;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  toggleNoiseSuppression: () => Promise<void>;
  /** Broadcast a small JSON message to everyone in the call (soundboard, activities). */
  sendData: (topic: string, payload: unknown) => Promise<void>;
  /** Subscribe to a data topic; returns an unsubscribe function. */
  onData: (topic: string, handler: DataHandler) => () => void;
  /** Audio mixer: overall call volume and per-person volume (0–1), remembered on this device. */
  mix: AudioMix;
  setMasterVolume: (volume: number) => void;
  setParticipantVolume: (identity: string, volume: number) => void;
  /** Switch microphone or speakers mid-call. */
  switchDevice: (kind: "audioinput" | "audiooutput", deviceId: string) => Promise<void>;
}

export interface AudioMix {
  master: number;
  people: Record<string, number>;
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
const SoundboardReceiver = dynamic(() => import("./SoundboardReceiver").then((m) => m.SoundboardReceiver), { ssr: false });

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
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return `No permission to use the ${what}. Allow it in your browser settings.`;
  if (["NotFoundError", "DevicesNotFoundError", "OverconstrainedError"].includes(name)) return `No ${what} found.`;
  if (["NotReadableError", "TrackStartError", "AbortError"].includes(name)) return `Another app is using the ${what}.`;
  return `Couldn't turn on the ${what}.`;
}

function readNoiseSuppression() {
  try {
    return localStorage.getItem(NS_KEY) !== "off";
  } catch {
    return true;
  }
}

// ---- voice pre-warming ------------------------------------------------------------------------
type TokenResponse = { ok: boolean; body: { token?: string; url?: string; error?: string } | null };

/** A pre-minted token is used at most this long after it was fetched (tokens themselves last an hour). */
export const PREWARM_FRESH_MS = 2 * 60_000;
/** Global spacing between pre-warm fetches, so sweeping the mouse over a channel list can't burn the
    voice-token rate limit (20/min). */
export const PREWARM_GAP_MS = 2_000;

const targetKey = (target: CallTarget) => `${target.kind === "dm" ? "dm" : "channel"}:${target.channelId}`;

function requestToken(target: CallTarget): Promise<TokenResponse> {
  return fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target.kind === "dm" ? { conversationId: target.channelId } : { channelId: target.channelId }),
  })
    .then(async (res) => ({ ok: res.ok, body: (await res.json().catch(() => null)) as TokenResponse["body"] }))
    .catch(() => ({ ok: false, body: null }));
}

const MIX_KEY = "diskarte:audio-mix";
/** Don't let a hung disconnect block joining the next room. */
const DISCONNECT_TIMEOUT_MS = 2500;
/** Re-announce "still talking" well inside the observers' SPEAKING_TTL_MS. */
const SPEAKING_HEARTBEAT_MS = 2000;
const clampVolume = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

function readMix(): AudioMix {
  try {
    const parsed = JSON.parse(localStorage.getItem(MIX_KEY) ?? "null") as Partial<AudioMix> | null;
    const people = Object.fromEntries(Object.entries(parsed?.people ?? {}).map(([id, v]) => [id, clampVolume(Number(v))]));
    return { master: clampVolume(Number(parsed?.master ?? 1)), people };
  } catch {
    return { master: 1, people: {} };
  }
}

/** Effective playback volume for one person: the master level times their own slider. */
export function effectiveVolume(mix: AudioMix, identity: string) {
  return mix.master * (mix.people[identity] ?? 1);
}

function applyMix(participant: RemoteParticipant, mix: AudioMix) {
  const volume = effectiveVolume(mix, participant.identity);
  participant.setVolume(volume);
  // Screen-share audio follows the same slider.
  participant.setVolume(volume, "screen_share_audio" as Parameters<RemoteParticipant["setVolume"]>[1]);
}

/** Remote video at low simulcast layers when low-data mode is on. */
function applySubscribeQuality(room: Room, lk: typeof import("livekit-client"), low: boolean) {
  room.remoteParticipants.forEach((p: RemoteParticipant) =>
    p.trackPublications.forEach((pub: RemoteTrackPublication) => {
      if (pub.kind === lk.Track.Kind.Video) pub.setVideoQuality(low ? lk.VideoQuality.LOW : lk.VideoQuality.HIGH);
    }),
  );
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
  const current = useRef<CallTarget | null>(null);
  const leaving = useRef(false);
  const mutedBeforeDeafen = useRef(false);
  const dataHandlers = useRef(new Map<string, Set<DataHandler>>());
  const [mix, setMix] = useState<AudioMix>(readMix);
  const warmed = useRef(new Map<string, { at: number; request: Promise<TokenResponse> }>());
  const lastWarm = useRef(0);
  const mixRef = useRef(mix);
  const setVoice = useVoicePresence();
  const isDm = state.target?.kind === "dm";

  useEffect(() => {
    current.current = state.target;
  }, [state.target]);

  // Keep the presence channel for the call's server open even while browsing other servers.
  useServerPresence(isDm ? undefined : state.target?.serverId);

  // Mirror call state into presence so sidebars show who is in which voice channel.
  useEffect(() => {
    if ((state.status === "connected" || state.status === "reconnecting") && state.target && state.target.kind !== "dm") {
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

  /** Disconnects the room; resolves once LiveKit has closed it (or after a short safety timeout). */
  const disconnect = useCallback(() => {
    const current = roomRef.current;
    if (!current) return Promise.resolve();
    leaving.current = true;
    playSfx("leave");
    // Tell everyone watching the server right away that we left the voice channel, instead of waiting
    // for the next render's presence effect.
    setVoice(null);
    const closed = Promise.resolve(current.disconnect()).catch(() => undefined);
    teardown();
    return Promise.race([closed, new Promise<void>((r) => setTimeout(r, DISCONNECT_TIMEOUT_MS))]).then(() => undefined);
  }, [teardown, setVoice]);

  const leave = useCallback(() => void disconnect(), [disconnect]);

  const join = useCallback(
    async (target: CallTarget) => {
      if (roomRef.current && state.target?.channelId === target.channelId) return;
      // Switching rooms: show "connecting" for the new one now, but fully close the old room (and drop
      // its voice presence) before connecting, so we never sit in two rooms or two rosters at once.
      const previous = roomRef.current ? disconnect() : null;
      setState((s) => ({ ...s, status: "connecting", target, camera: false, screen: false }));
      if (previous) await previous;
      leaving.current = false;

      // A token minted on hover saves the round trip; a stale or failed one falls back to a fresh request.
      const cached = warmed.current.get(targetKey(target));
      warmed.current.delete(targetKey(target));
      let response = cached && Date.now() - cached.at < PREWARM_FRESH_MS ? await cached.request : null;
      if (!response?.ok || !response.body?.token) response = await requestToken(target);
      const body = response.body;
      if (!response.ok || !body?.token || !body.url) {
        playSfx("error");
        toast.error(body?.error ?? "Couldn't connect to voice. Try again.");
        setState((s) => ({ ...IDLE, noiseSuppression: s.noiseSuppression }));
        return;
      }

      const lk = await loadLivekit();
      const ns = readNoiseSuppression();
      // Low-data mode: 360p camera, 720p/5fps screen share, and low simulcast layers for others.
      const lowData = getLowDataMode();
      const next = new lk.Room({
        adaptiveStream: true,
        dynacast: true,
        disconnectOnPageLeave: true,
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: ns, autoGainControl: true },
        videoCaptureDefaults: { resolution: (lowData ? lk.VideoPresets.h360 : lk.VideoPresets.h720).resolution },
        publishDefaults: {
          simulcast: true,
          screenShareEncoding: (lowData ? lk.ScreenSharePresets.h720fps5 : lk.ScreenSharePresets.h1080fps15).encoding,
          dtx: true,
          red: !lowData,
        },
      });

      next
        .on(lk.RoomEvent.ParticipantConnected, () => playSfx("join"))
        .on(lk.RoomEvent.ParticipantDisconnected, () => playSfx("leave"))
        .on(lk.RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => setSpeaking(speakers.map((p) => p.identity)))
        .on(lk.RoomEvent.TrackSubscribed, (_track: unknown, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (getLowDataMode() && publication.kind === lk.Track.Kind.Video) publication.setVideoQuality(lk.VideoQuality.LOW);
          if (publication.kind === lk.Track.Kind.Audio) applyMix(participant, mixRef.current);
        })
        .on(lk.RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant, _kind?: unknown, topic?: string) => {
          const handlers = topic ? dataHandlers.current.get(topic) : undefined;
          if (!handlers?.size) return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(new TextDecoder().decode(payload));
          } catch {
            return;
          }
          handlers.forEach((h) => h(parsed, participant?.identity ?? null));
        })
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
            toast(reason === (lk.DisconnectReason.DUPLICATE_IDENTITY as DisconnectReason) ? "You joined voice from another tab." : "You were disconnected from voice.");
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
          toast.error("Couldn't reach the voice server.");
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
    [disconnect, teardown, state.target?.channelId],
  );

  const prewarm = useCallback((target: CallTarget) => {
    void loadLivekit(); // the ~650 KB SDK starts downloading now instead of on click
    const key = targetKey(target);
    const now = Date.now();
    if (roomRef.current && current.current?.channelId === target.channelId) return;
    const cached = warmed.current.get(key);
    if (cached && now - cached.at < PREWARM_FRESH_MS) return;
    if (now - lastWarm.current < PREWARM_GAP_MS) return;
    lastWarm.current = now;
    const request = requestToken(target);
    warmed.current.set(key, { at: now, request });
    void request.then((r) => {
      if (!r.ok && warmed.current.get(key)?.request === request) warmed.current.delete(key);
    });
  }, []);

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
        .catch(() => toast.error("Couldn't apply noise suppression."));
    }
    toast(enabled ? "Noise suppression: on" : "Noise suppression: off");
  }, [state.noiseSuppression]);

  // Toggling low-data mode mid-call re-requests remote video at the matching quality.
  useEffect(
    () =>
      subscribeLowDataMode(() => {
        const current = roomRef.current;
        if (current) void loadLivekit().then((lk) => applySubscribeQuality(current, lk, getLowDataMode()));
      }),
    [],
  );

  const sendData = useCallback(async (topic: string, payload: unknown) => {
    const current = roomRef.current;
    if (!current) return;
    await current.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true, topic });
  }, []);

  const onData = useCallback((topic: string, handler: DataHandler) => {
    const map = dataHandlers.current;
    if (!map.has(topic)) map.set(topic, new Set());
    map.get(topic)!.add(handler);
    return () => {
      map.get(topic)?.delete(handler);
    };
  }, []);

  // Voice activity for people *watching* the server (sidebar rosters): an ephemeral Realtime Broadcast
  // on the server's presence channel — on start/stop plus a heartbeat while talking — never stored.
  const broadcastSpeaking = useBroadcastSpeaking();
  const speakingServer = state.status === "connected" && state.target && state.target.kind !== "dm" ? state.target.serverId : null;
  const localIdentity = room?.localParticipant?.identity;
  const meSpeaking = !!localIdentity && !state.muted && speaking.includes(localIdentity);
  useEffect(() => {
    if (!speakingServer || !meSpeaking) return;
    broadcastSpeaking(speakingServer, true);
    const heartbeat = setInterval(() => broadcastSpeaking(speakingServer, true), SPEAKING_HEARTBEAT_MS);
    return () => {
      clearInterval(heartbeat);
      broadcastSpeaking(speakingServer, false);
    };
  }, [speakingServer, meSpeaking, broadcastSpeaking]);

  // Mixer: apply levels to everyone in the room and remember them on this device.
  useEffect(() => {
    mixRef.current = mix;
    room?.remoteParticipants.forEach((p) => applyMix(p, mix));
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(mix));
    } catch {
      // Storage blocked: levels last for this session only.
    }
  }, [room, mix]);

  const setMasterVolume = useCallback((volume: number) => setMix((m) => ({ ...m, master: clampVolume(volume) })), []);
  const setParticipantVolume = useCallback((identity: string, volume: number) => setMix((m) => ({ ...m, people: { ...m.people, [identity]: clampVolume(volume) } })), []);

  const switchDevice = useCallback(async (kind: "audioinput" | "audiooutput", deviceId: string) => {
    const current = roomRef.current;
    if (!current) return;
    try {
      await current.switchActiveDevice(kind, deviceId);
    } catch (err) {
      toast.error(kind === "audioinput" ? mediaErrorMessage(err, "mic") : "Couldn't switch speakers.");
    }
  }, []);

  useEffect(() => () => void roomRef.current?.disconnect(), []);

  const value = useMemo<CallContextValue>(
    () => ({
      ...state,
      room,
      speaking,
      join,
      prewarm,
      leave,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreen,
      toggleNoiseSuppression,
      sendData,
      onData,
      mix,
      setMasterVolume,
      setParticipantVolume,
      switchDevice,
    }),
    [state, room, speaking, join, prewarm, leave, toggleMute, toggleDeafen, toggleCamera, toggleScreen, toggleNoiseSuppression, sendData, onData, mix, setMasterVolume, setParticipantVolume, switchDevice],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {room && state.status !== "idle" && <CallAudio room={room} muted={state.deafened} />}
      {room && state.status === "connected" && <SoundboardReceiver />}
    </CallContext.Provider>
  );
}

/**
 * Returns `handlersFor(target)`: pointer/focus/touch handlers that pre-warm a voice join once the user
 * shows intent (a short hover, keyboard focus or a touch), never on a mouse merely sweeping past.
 */
export function usePrewarm() {
  const call = useContext(CallContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useCallback(
    (target: CallTarget) => {
      if (!call) return {};
      const warm = () => call.prewarm(target);
      const cancel = () => {
        if (timer.current) clearTimeout(timer.current);
      };
      return {
        onPointerEnter: () => {
          cancel();
          timer.current = setTimeout(warm, 150);
        },
        onPointerLeave: cancel,
        onFocus: warm,
        onTouchStart: warm,
      };
    },
    [call],
  );
}

export function useCall(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error("useCall must be used inside <CallProvider>");
  return value;
}
