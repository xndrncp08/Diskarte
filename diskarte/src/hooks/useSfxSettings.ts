"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SFX_SETTINGS, getSfxSettings, subscribeSfxSettings } from "@/lib/sfx";

/** Live sound-effect settings (updates across components when changed anywhere). */
export function useSfxSettings() {
  return useSyncExternalStore(subscribeSfxSettings, getSfxSettings, () => DEFAULT_SFX_SETTINGS);
}
