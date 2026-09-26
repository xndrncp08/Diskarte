/**
 * 8-bit sound effects synthesised with the Web Audio API — no audio files to download.
 * Each cue is a short sequence of square/triangle-wave notes with a quick decay envelope.
 */
export type SfxName = "join" | "leave" | "mute" | "unmute" | "deafen" | "message" | "mention" | "send" | "error" | "start";

interface Note {
  freq: number;
  dur: number;
  wave?: OscillatorType;
  slideTo?: number;
}

const CUES: Record<SfxName, Note[]> = {
  join: [
    { freq: 523.25, dur: 0.07 },
    { freq: 659.25, dur: 0.07 },
    { freq: 783.99, dur: 0.12 },
  ],
  leave: [
    { freq: 783.99, dur: 0.07 },
    { freq: 659.25, dur: 0.07 },
    { freq: 392, dur: 0.14 },
  ],
  mute: [{ freq: 440, dur: 0.08, slideTo: 220 }],
  unmute: [{ freq: 220, dur: 0.08, slideTo: 440 }],
  deafen: [
    { freq: 330, dur: 0.06 },
    { freq: 196, dur: 0.12, wave: "triangle" },
  ],
  message: [
    { freq: 987.77, dur: 0.05 },
    { freq: 1318.51, dur: 0.09 },
  ],
  mention: [
    { freq: 1046.5, dur: 0.06 },
    { freq: 1318.51, dur: 0.06 },
    { freq: 1567.98, dur: 0.1 },
  ],
  send: [{ freq: 1567.98, dur: 0.04, wave: "triangle" }],
  error: [
    { freq: 196, dur: 0.1 },
    { freq: 146.83, dur: 0.16 },
  ],
  start: [
    { freq: 392, dur: 0.06 },
    { freq: 523.25, dur: 0.06 },
    { freq: 659.25, dur: 0.06 },
    { freq: 1046.5, dur: 0.16 },
  ],
};

const STORAGE_KEY = "diskarte:sfx";
let context: AudioContext | null = null;

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSfxEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage blocked (private mode) — keep the in-memory default.
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

export function playSfx(name: SfxName, volume = 0.08) {
  if (!sfxEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  let t = ctx.currentTime + 0.01;
  for (const note of CUES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave ?? "square";
    osc.frequency.setValueAtTime(note.freq, t);
    if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t + note.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.dur + 0.02);
    t += note.dur * 0.9;
  }
}

export const SFX_NAMES = Object.keys(CUES) as SfxName[];
export function cueDuration(name: SfxName) {
  return CUES[name].reduce((sum, n) => sum + n.dur * 0.9, 0);
}
