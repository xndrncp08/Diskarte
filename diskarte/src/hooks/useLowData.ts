"use client";

import { useSyncExternalStore } from "react";
import { getLowDataMode, subscribeLowDataMode } from "@/lib/low-data";

/** Live low-data mode flag (false during SSR). */
export function useLowData(): boolean {
  return useSyncExternalStore(subscribeLowDataMode, getLowDataMode, () => false);
}
