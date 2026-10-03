import type { Cue } from "@/lib/sfx";

/**
 * Built-in 8-bit meme sounds, synthesised in the browser (zero downloads). Server admins can add
 * their own MP3 clips on top (soundboard_clips table + private `soundboard` bucket).
 */
export interface BuiltinClip {
  key: string;
  name: string;
  /** Glyph code drawn as a vector icon (custom clips may hold an older emoji, shown via its icon). */
  emoji: string;
  cue: Cue;
}

const sq = (freq: number, at: number, dur: number, extra: Partial<Cue["notes"][number]> = {}) => ({ freq, at, dur, ...extra });

export const BUILTIN_CLIPS: BuiltinClip[] = [
  {
    key: "airhorn",
    name: "Airhorn",
    emoji: ":airhorn:",
    cue: {
      level: 0.9,
      notes: [0, 0.22, 0.44].flatMap((at, i) => [
        sq(466, at, i === 2 ? 0.5 : 0.18, { slideTo: i === 2 ? 440 : undefined }),
        sq(587, at, i === 2 ? 0.5 : 0.18, { gain: 0.8 }),
        sq(698, at, i === 2 ? 0.5 : 0.18, { gain: 0.6 }),
      ]),
    },
  },
  {
    key: "ba-dum-tss",
    name: "Ba Dum Tss",
    emoji: ":drum:",
    cue: {
      notes: [sq(110, 0, 0.12, { wave: "triangle", slideTo: 60 }), sq(98, 0.18, 0.14, { wave: "triangle", slideTo: 55 })],
      noise: [
        { at: 0, dur: 0.08, gain: 0.3 },
        { at: 0.18, dur: 0.08, gain: 0.3 },
        { at: 0.42, dur: 0.6, gain: 0.5 },
      ],
    },
  },
  {
    key: "sad-trombone",
    name: "Sad Trombone",
    emoji: ":sad:",
    cue: {
      notes: [
        sq(392, 0, 0.3, { wave: "triangle", slideTo: 370 }),
        sq(370, 0.32, 0.3, { wave: "triangle", slideTo: 349 }),
        sq(349, 0.64, 0.3, { wave: "triangle", slideTo: 330 }),
        sq(330, 0.96, 0.9, { wave: "triangle", slideTo: 262 }),
      ],
    },
  },
  {
    key: "level-up",
    name: "Level Up!",
    emoji: ":star:",
    cue: {
      notes: [523, 659, 784, 1047, 784, 1047, 1319].map((f, i) => sq(f, i * 0.07, i === 6 ? 0.3 : 0.07)),
    },
  },
  {
    key: "coin",
    name: "Barya",
    emoji: ":coins:",
    cue: { level: 0.8, notes: [sq(988, 0, 0.08), sq(1319, 0.08, 0.35)] },
  },
  {
    key: "boing",
    name: "Boing",
    emoji: ":warp:",
    cue: { notes: [sq(150, 0, 0.35, { wave: "triangle", slideTo: 600 }), sq(600, 0.35, 0.25, { wave: "triangle", slideTo: 300 })] },
  },
  {
    key: "wow",
    name: "Wowowow",
    emoji: ":eyes:",
    cue: {
      notes: [0, 0.15, 0.3, 0.45].map((at) => sq(330, at, 0.15, { wave: "triangle", slideTo: 494 })),
    },
  },
  {
    key: "kaboom",
    name: "Kaboom",
    emoji: ":boom:",
    cue: {
      notes: [sq(120, 0, 0.8, { wave: "square", slideTo: 30 })],
      noise: [{ at: 0, dur: 1, gain: 1 }],
    },
  },
  {
    key: "palakpakan",
    name: "Palakpakan",
    emoji: ":lodi:",
    cue: {
      notes: [],
      noise: Array.from({ length: 10 }, (_, i) => ({ at: i * 0.11 + (i % 3) * 0.02, dur: 0.06, gain: 0.8 })),
    },
  },
  {
    key: "tama",
    name: "Tama!",
    emoji: ":check:",
    cue: { notes: [sq(784, 0, 0.1), sq(1047, 0.1, 0.25)] },
  },
  {
    key: "mali",
    name: "Mali!",
    emoji: ":cross:",
    cue: { notes: [sq(110, 0, 0.5, { gain: 0.9 }), sq(116, 0, 0.5, { gain: 0.9 })] },
  },
  {
    key: "bruh",
    name: "Bruh",
    emoji: ":bruh:",
    cue: { notes: [sq(140, 0, 0.35, { slideTo: 90, gain: 0.9 })] },
  },
];

export function builtinClip(key: string): BuiltinClip | undefined {
  return BUILTIN_CLIPS.find((c) => c.key === key);
}

/** Data-channel message announcing a clip to everyone in the call. */
export type SoundboardMessage = { type: "play"; kind: "builtin"; key: string } | { type: "play"; kind: "clip"; clipId: string };

export function parseSoundboardMessage(value: unknown): SoundboardMessage | null {
  const v = value as Partial<{ type: string; kind: string; key: string; clipId: string }> | null;
  if (!v || v.type !== "play") return null;
  if (v.kind === "builtin" && typeof v.key === "string" && builtinClip(v.key)) return { type: "play", kind: "builtin", key: v.key };
  if (v.kind === "clip" && typeof v.clipId === "string" && /^[0-9a-f-]{36}$/.test(v.clipId)) return { type: "play", kind: "clip", clipId: v.clipId };
  return null;
}

/** Anti-spam: one clip per sender every COOLDOWN_MS, and uploaded clips are cut at MAX_CLIP_MS. */
export const SOUNDBOARD_COOLDOWN_MS = 2000;
export const MAX_CLIP_MS = 6000;
export const MAX_CLIP_BYTES = 1024 * 1024;

export function createThrottle(windowMs: number, now: () => number = Date.now) {
  const last = new Map<string, number>();
  return (key: string) => {
    const t = now();
    const prev = last.get(key);
    if (prev !== undefined && t - prev < windowMs) return false;
    last.set(key, t);
    return true;
  };
}

// ---- per-user preferences ------------------------------------------------------------
const MUTE_KEY = "diskarte:soundboard-muted";

export function soundboardMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundboardMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore
  }
}
