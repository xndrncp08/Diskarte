/**
 * 8-bit sound effects synthesised with the Web Audio API — no audio files to download.
 * Each cue layers short square/triangle notes (with optional pitch slides) and, for toggles, a tiny
 * noise "click", shaped by fast attack/decay envelopes. A persisted master volume scales everything.
 */
export type SfxName = "join" | "leave" | "mute" | "unmute" | "deafen" | "message" | "mention" | "send" | "error" | "start" | "ring";

export interface Note {
  freq: number;
  dur: number;
  /** Start offset from the beginning of the cue, in seconds. */
  at: number;
  wave?: OscillatorType;
  slideTo?: number;
  /** Relative loudness 0–1 (default 1). */
  gain?: number;
}

export interface Cue {
  notes: Note[];
  /** A short filtered noise burst — the "switch" in toggle sounds. */
  click?: { at: number; dur: number; gain?: number };
  /** Longer noise bursts (snares, cymbals, explosions) for soundboard clips. */
  noise?: { at: number; dur: number; gain?: number }[];
  /** Overall loudness of the cue relative to others. */
  level?: number;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;
const C7 = 2093;

const CUES: Record<SfxName, Cue> = {
  // Bright retro chime: fast major arpeggio over a soft octave pad.
  join: {
    notes: [
      { freq: C6, at: 0, dur: 0.08 },
      { freq: E6, at: 0.055, dur: 0.08 },
      { freq: G6, at: 0.11, dur: 0.08 },
      { freq: C7, at: 0.165, dur: 0.16, gain: 0.8 },
      { freq: C5, at: 0, dur: 0.34, wave: "triangle", gain: 0.45 },
    ],
  },
  // Descending synth line ending in a pitch drop.
  leave: {
    notes: [
      { freq: G5, at: 0, dur: 0.09 },
      { freq: E5, at: 0.075, dur: 0.09 },
      { freq: C5, at: 0.15, dur: 0.09 },
      { freq: C5, at: 0.225, dur: 0.26, wave: "triangle", slideTo: 196, gain: 0.8 },
    ],
  },
  // Soft pixel pop: one rounded blip with a quick downward bend.
  message: { level: 0.6, notes: [{ freq: 1320, at: 0, dur: 0.07, wave: "triangle", slideTo: 880 }] },
  mention: {
    level: 0.8,
    notes: [
      { freq: 1320, at: 0, dur: 0.06, wave: "triangle", slideTo: 990 },
      { freq: 1760, at: 0.07, dur: 0.09, wave: "triangle", slideTo: 1320 },
    ],
  },
  // Toggle clicks: switch noise + a short pitch bend down (mute) or up (unmute).
  mute: { click: { at: 0, dur: 0.012 }, notes: [{ freq: 330, at: 0.008, dur: 0.06, slideTo: 196, gain: 0.7 }] },
  unmute: { click: { at: 0, dur: 0.012 }, notes: [{ freq: 220, at: 0.008, dur: 0.06, slideTo: 440, gain: 0.7 }] },
  deafen: {
    click: { at: 0, dur: 0.012 },
    notes: [
      { freq: 262, at: 0.008, dur: 0.07, gain: 0.7 },
      { freq: 196, at: 0.07, dur: 0.12, wave: "triangle", slideTo: 131 },
    ],
  },
  send: { level: 0.5, notes: [{ freq: G6, at: 0, dur: 0.035, wave: "triangle" }] },
  error: {
    notes: [
      { freq: 196, at: 0, dur: 0.1 },
      { freq: 146.83, at: 0.09, dur: 0.16 },
    ],
  },
  start: {
    notes: [
      { freq: 392, at: 0, dur: 0.06 },
      { freq: C5, at: 0.055, dur: 0.06 },
      { freq: E5, at: 0.11, dur: 0.06 },
      { freq: C6, at: 0.165, dur: 0.16 },
    ],
  },
  // Incoming call: a two-tone 8-bit trill, twice (looped by the incoming-call pop-up).
  ring: {
    level: 0.8,
    notes: [
      ...[0, 0.09, 0.18, 0.27].map((at, i) => ({ freq: i % 2 ? E6 : C6, at, dur: 0.08, wave: "square" as OscillatorType, gain: 0.8 })),
      ...[0.6, 0.69, 0.78, 0.87].map((at, i) => ({ freq: i % 2 ? E6 : C6, at, dur: 0.08, wave: "square" as OscillatorType, gain: 0.8 })),
    ],
  },
};

export const SFX_NAMES = Object.keys(CUES) as SfxName[];

// ---------------------------------------------------------------------------------------
// Settings (persisted per browser)
// ---------------------------------------------------------------------------------------

export interface SfxSettings {
  enabled: boolean;
  /** Master volume 0–1. */
  volume: number;
}

const STORAGE_KEY = "diskarte:sfx";
export const DEFAULT_SFX_SETTINGS: SfxSettings = { enabled: true, volume: 0.6 };
const PEAK_GAIN = 0.16; // full-volume peak per note — 8-bit squares are loud

let cached: SfxSettings | null = null;
const listeners = new Set<() => void>();

function clampVolume(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SFX_SETTINGS.volume;
}

export function getSfxSettings(): SfxSettings {
  if (cached) return cached;
  let next = DEFAULT_SFX_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "off") next = { ...DEFAULT_SFX_SETTINGS, enabled: false }; // legacy value
    else if (raw && raw !== "on") {
      const parsed = JSON.parse(raw) as Partial<SfxSettings>;
      next = { enabled: parsed.enabled !== false, volume: clampVolume(Number(parsed.volume ?? DEFAULT_SFX_SETTINGS.volume)) };
    }
  } catch {
    // Storage blocked or corrupt — defaults.
  }
  cached = next;
  return next;
}

export function setSfxSettings(patch: Partial<SfxSettings>) {
  const next: SfxSettings = { ...getSfxSettings(), ...patch };
  next.volume = clampVolume(next.volume);
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode: keep the in-memory value for this session.
  }
  listeners.forEach((l) => l());
}

export function subscribeSfxSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: forget the cached settings so the next read hits storage again. */
export function resetSfxSettingsCache() {
  cached = null;
}

export function sfxEnabled(): boolean {
  return getSfxSettings().enabled;
}

export function setSfxEnabled(enabled: boolean) {
  setSfxSettings({ enabled });
}

// ---------------------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------------------

let context: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === "suspended") void context.resume();
  return context;
}

function noise(ctx: AudioContext): AudioBuffer | null {
  if (typeof ctx.createBuffer !== "function") return null;
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    const length = Math.max(1, Math.floor((ctx.sampleRate || 44100) * 0.03));
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate || 44100);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  return noiseBuffer;
}

/** Plays a cue. `volume` overrides the saved master volume (used by the settings preview). */
export function playSfx(name: SfxName, volume?: number) {
  const settings = getSfxSettings();
  if (!settings.enabled && volume === undefined) return;
  playCue(CUES[name], volume ?? settings.volume);
}

const noiseBuffers = new Map<number, AudioBuffer>();

/** White noise of a given length (cached per length), decaying linearly. */
function longNoise(ctx: AudioContext, dur: number): AudioBuffer | null {
  if (typeof ctx.createBuffer !== "function") return null;
  const rate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(rate * dur));
  const cached = noiseBuffers.get(length);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  noiseBuffers.set(length, buffer);
  return buffer;
}

/** Synthesises any cue at `volume` (0–1). Used by the UI sounds and the soundboard. */
export function playCue(cue: Cue, volume: number) {
  const master = clampVolume(volume);
  if (master === 0) return;
  const ctx = audio();
  if (!ctx) return;
  const level = master * (cue.level ?? 1) * PEAK_GAIN;
  const t0 = ctx.currentTime + 0.01;

  for (const note of cue.notes) {
    const start = t0 + note.at;
    const peak = Math.max(0.0002, level * (note.gain ?? 1));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.wave ?? "square";
    osc.frequency.setValueAtTime(note.freq, start);
    if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, start + note.dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.02);
  }

  if (cue.click) {
    const buffer = noise(ctx);
    if (buffer && typeof ctx.createBufferSource === "function") {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      const start = t0 + cue.click.at;
      gain.gain.setValueAtTime(level * 0.8 * (cue.click.gain ?? 1), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + cue.click.dur);
      src.connect(gain).connect(ctx.destination);
      src.start(start);
      src.stop(start + cue.click.dur + 0.01);
    }
  }

  for (const burst of cue.noise ?? []) {
    const buffer = longNoise(ctx, burst.dur);
    if (!buffer || typeof ctx.createBufferSource !== "function") continue;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    const start = t0 + burst.at;
    gain.gain.setValueAtTime(Math.max(0.0002, level * (burst.gain ?? 0.6)), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + burst.dur);
    src.connect(gain).connect(ctx.destination);
    src.start(start);
    src.stop(start + burst.dur + 0.01);
  }
}

export function cueDuration(name: SfxName | Cue) {
  const cue = typeof name === "string" ? CUES[name] : name;
  const notesEnd = cue.notes.reduce((end, n) => Math.max(end, n.at + n.dur), 0);
  const noiseEnd = (cue.noise ?? []).reduce((end, n) => Math.max(end, n.at + n.dur), 0);
  return Math.max(notesEnd, noiseEnd, cue.click ? cue.click.at + cue.click.dur : 0);
}
