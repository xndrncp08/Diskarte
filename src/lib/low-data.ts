/**
 * Low-data mode (for prepaid data and weak LTE): smaller/lower-quality images, GIFs don't autoplay,
 * videos don't preload, and LiveKit captures + subscribes at low resolution. Persisted per browser.
 */
const STORAGE_KEY = "diskarte:low-data";

let cached: boolean | null = null;
const listeners = new Set<() => void>();

/** Honour the browser's Save-Data hint until the user picks explicitly. */
function saveDataHint(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
}

export function getLowDataMode(): boolean {
  if (cached !== null) return cached;
  let value = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    value = raw === null ? saveDataHint() : raw === "on";
  } catch {
    value = saveDataHint();
  }
  cached = value;
  return value;
}

export function setLowDataMode(enabled: boolean) {
  cached = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Private mode: keep it for this session only.
  }
  listeners.forEach((l) => l());
}

export function subscribeLowDataMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test helper. */
export function resetLowDataCache() {
  cached = null;
}

/** next/image quality for chat images. */
export function imageQuality(lowData: boolean) {
  return lowData ? 40 : 75;
}
