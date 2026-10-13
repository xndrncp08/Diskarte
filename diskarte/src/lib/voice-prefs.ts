/**
 * Voice & Video settings (Discord's): devices, input profile, push to talk. Saved per browser and
 * read by the call when it joins; device changes apply to a live call too.
 */
export type InputProfile = "isolation" | "studio" | "custom";

export interface VoicePrefs {
  inputId: string | null;
  outputId: string | null;
  cameraId: string | null;
  /** Voice Isolation: all processing on. Studio: none. Custom: the switches below. */
  profile: InputProfile;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  pushToTalk: boolean;
  /** KeyboardEvent.code that talks while held. */
  pttKey: string;
}

const KEY = "diskarte:voice-prefs";
/** Older builds kept noise suppression on its own; still honoured as the Custom default. */
const LEGACY_NS_KEY = "diskarte:noise-suppression";

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  inputId: null,
  outputId: null,
  cameraId: null,
  profile: "isolation",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  pushToTalk: false,
  pttKey: "KeyV",
};

let cached: VoicePrefs | null = null;
const listeners = new Set<() => void>();

export function parseVoicePrefs(raw: string | null, legacyNs: string | null = null): VoicePrefs {
  let v: Partial<VoicePrefs> = {};
  try {
    v = raw ? (JSON.parse(raw) as Partial<VoicePrefs>) : {};
  } catch {
    v = {};
  }
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
  return {
    inputId: str(v.inputId),
    outputId: str(v.outputId),
    cameraId: str(v.cameraId),
    profile: v.profile === "studio" || v.profile === "custom" ? v.profile : raw ? "isolation" : legacyNs === "off" ? "custom" : "isolation",
    echoCancellation: bool(v.echoCancellation, true),
    noiseSuppression: bool(v.noiseSuppression, legacyNs !== "off"),
    autoGainControl: bool(v.autoGainControl, true),
    pushToTalk: bool(v.pushToTalk, false),
    pttKey: str(v.pttKey) ?? "KeyV",
  };
}

export function readVoicePrefs(): VoicePrefs {
  if (cached) return cached;
  try {
    cached = parseVoicePrefs(localStorage.getItem(KEY), localStorage.getItem(LEGACY_NS_KEY));
  } catch {
    cached = DEFAULT_VOICE_PREFS;
  }
  return cached;
}

export function setVoicePrefs(patch: Partial<VoicePrefs>) {
  cached = { ...readVoicePrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Private mode: this session only.
  }
  listeners.forEach((l) => l());
}

export function subscribeVoicePrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetVoicePrefsCache() {
  cached = null;
}

/** The mic processing an input profile means. */
export function micProcessing(p: VoicePrefs): { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean } {
  if (p.profile === "isolation") return { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  if (p.profile === "studio") return { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  return { echoCancellation: p.echoCancellation, noiseSuppression: p.noiseSuppression, autoGainControl: p.autoGainControl };
}

/** "KeyV" → "V", "Space" → "Space", "Digit1" → "1". */
export function keyLabel(code: string) {
  return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
}
