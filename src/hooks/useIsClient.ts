"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => undefined;

/** false during SSR and the hydration pass, true afterwards — avoids hydration mismatches. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
