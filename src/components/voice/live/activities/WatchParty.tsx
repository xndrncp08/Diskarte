"use client";

import { Pause, Play, RefreshCw, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { expectedPosition, needsResync, playerCommand, youtubeEmbedUrl, type WatchState } from "@/lib/youtube";

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
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

  const send = (message: string) => frame.current?.contentWindow?.postMessage(message, PLAYER_ORIGIN);

  // Track the player's current time from its infoDelivery events.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      try {
        const data = JSON.parse(e.data) as { event?: string; info?: { currentTime?: number } };
        if (data.event === "infoDelivery" && typeof data.info?.currentTime === "number") localTime.current = data.info.currentTime;
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
      <div className="flex items-center justify-center gap-1.5" role="toolbar" aria-label="Watch party controls">
        <button type="button" aria-label="Back 10 seconds" onClick={() => onChange({ ...state, position: Math.max(0, at() - 10), at: now() })} className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20">
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
        <button type="button" aria-label="Forward 10 seconds" onClick={() => onChange({ ...state, position: at() + 10, at: now() })} className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20">
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
      </div>
    </div>
  );
}
