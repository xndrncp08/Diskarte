"use client";

import { Pause, Play, RefreshCw, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { expectedPosition, formatClock, needsResync, playerCommand, youtubeEmbedUrl, type WatchState } from "@/lib/youtube";

const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";

/**
 * Privacy-enhanced YouTube embed kept in lockstep with the room: play/pause/seek are shared state,
 * and each client quietly re-seeks when it drifts more than ~1.5 s from where everyone should be.
 * The player is driven over postMessage, so no YouTube script runs in our page.
 */
export function WatchParty({ state, onChange }: { state: WatchState; onChange: (next: WatchState) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const localTime = useRef(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  // Length and where the player is (from its infoDelivery events); `scrub` while the seek bar is held.
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

  const send = (message: string) => frame.current?.contentWindow?.postMessage(message, PLAYER_ORIGIN);

  // Track the player's current time from its infoDelivery events.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data) as { event?: string; info?: { currentTime?: number; duration?: number } };
        if (data.event !== "infoDelivery" && data.event !== "initialDelivery") return;
        if (typeof data.info?.currentTime === "number") {
          localTime.current = data.info.currentTime;
          setTime(data.info.currentTime);
        }
        if (typeof data.info?.duration === "number" && data.info.duration > 0) setDuration(data.info.duration);
      } catch {
        // Not a player message.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Apply shared state whenever it changes, then keep checking for drift.
  useEffect(() => {
    const apply = () => {
      send(playerCommand("seekTo", [expectedPosition(state, Date.now()), true]));
      send(playerCommand(state.playing ? "playVideo" : "pauseVideo"));
    };
    apply();
    const timer = setInterval(() => {
      if (state.playing && needsResync(localTime.current, state, Date.now())) send(playerCommand("seekTo", [expectedPosition(state, Date.now()), true]));
    }, 3000);
    return () => clearInterval(timer);
  }, [state]);

  function onLoad() {
    send(JSON.stringify({ event: "listening", id: "diskarte" }));
    send(playerCommand("seekTo", [expectedPosition(state, Date.now()), true]));
    send(playerCommand(state.playing ? "playVideo" : "pauseVideo"));
  }

  const now = () => Date.now();
  const at = () => expectedPosition(state, now());
  /** Seeks everyone in the call. */
  const seek = (seconds: number) => onChange({ ...state, position: Math.max(0, duration ? Math.min(duration, seconds) : seconds), at: now() });
  const commitScrub = () => {
    if (scrub === null) return;
    seek(scrub);
    setScrub(null);
  };
  const shown = scrub ?? time;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-2" data-testid="watch-party">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
        <iframe
          ref={frame}
          src={youtubeEmbedUrl(state.videoId, origin)}
          title="Watch party"
          onLoad={onLoad}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          className="absolute inset-0 size-full"
        />
      </div>
      {/* Seek bar: dragging or the arrow keys move the video for everyone. */}
      <div className="flex items-center gap-2 px-1 text-[11px] tabular-nums text-slate-400">
        <span className="w-12 text-right">{formatClock(shown)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(duration))}
          step={1}
          value={Math.min(Math.round(shown), Math.max(1, Math.round(duration)))}
          disabled={!duration}
          aria-label="Seek (for everyone)"
          aria-valuetext={`${formatClock(shown)} of ${formatClock(duration)}`}
          onChange={(e) => setScrub(Number(e.target.value))}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-sun disabled:cursor-default disabled:opacity-40"
        />
        <span className="w-12">{duration ? formatClock(duration) : "–:––"}</span>
      </div>
      <div className="flex items-center justify-center gap-1.5" role="toolbar" aria-label="Watch party controls">
        <button type="button" aria-label="Back 10 seconds" onClick={() => seek(at() - 10)} className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20">
          <RotateCcw className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={state.playing ? "Pause for everyone" : "Play for everyone"}
          onClick={() => onChange({ ...state, playing: !state.playing, position: at(), at: now() })}
          className="rounded-lg bg-sun px-4 py-2 text-abyss hover:brightness-110"
        >
          {state.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <button type="button" aria-label="Forward 10 seconds" onClick={() => seek(at() + 10)} className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20">
          <RotateCw className="size-4" aria-hidden />
        </button>
        <button type="button" aria-label="Resync" title="Resync" onClick={() => send(playerCommand("seekTo", [at(), true]))} className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20">
          <RefreshCw className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={muted ? "Unmute video (just you)" : "Mute video (just you)"}
          onClick={() => {
            send(playerCommand(muted ? "unMute" : "mute"));
            setMuted(!muted);
          }}
          className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20"
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : volume}
          aria-label="Video volume (just you)"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            send(playerCommand("setVolume", [v]));
            if (v > 0 && muted) {
              send(playerCommand("unMute"));
              setMuted(false);
            }
          }}
          className="h-1.5 w-24 cursor-pointer accent-sun"
        />
      </div>
    </div>
  );
}
