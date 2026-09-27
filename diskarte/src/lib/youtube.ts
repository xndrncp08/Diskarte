/** YouTube watch party helpers: parse links, build privacy-enhanced embed URLs, compute sync. */
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Accepts youtu.be/…, youtube.com/watch?v=…, /shorts/…, /embed/…, /live/… or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = match?.[1] ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Privacy-enhanced embed with the JS API enabled (controlled via postMessage, no extra script). */
export function youtubeEmbedUrl(videoId: string, origin: string) {
  const params = new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0", modestbranding: "1", controls: "0", origin });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

export interface WatchState {
  videoId: string;
  playing: boolean;
  /** Playback position (seconds) at `at`. */
  position: number;
  /** Epoch ms the position was sampled. */
  at: number;
}

/** Where everyone should be right now. */
export function expectedPosition(state: WatchState, now: number) {
  return state.playing ? state.position + Math.max(0, now - state.at) / 1000 : state.position;
}

/** Re-seek only when we've drifted noticeably (avoids stutter from constant seeking). */
export function needsResync(localPosition: number, state: WatchState, now: number, tolerance = 1.5) {
  return Math.abs(localPosition - expectedPosition(state, now)) > tolerance;
}

export function isWatchState(value: unknown): value is WatchState {
  const v = value as Partial<WatchState> | null;
  return !!v && typeof v.videoId === "string" && ID_RE.test(v.videoId) && typeof v.playing === "boolean" && typeof v.position === "number" && typeof v.at === "number";
}

/** postMessage command for the embedded player. */
export function playerCommand(func: "playVideo" | "pauseVideo" | "seekTo" | "mute" | "unMute", args: unknown[] = []) {
  return JSON.stringify({ event: "command", func, args });
}
