"use client";

import { useSyncExternalStore } from "react";

/**
 * Live CSS media query. `serverValue` is used for SSR and the first hydration pass (desktop by
 * default), then the real value takes over without a hydration mismatch.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** Phones and small tablets: bottom sheets, card lists, sticky action bars. */
export function useIsCompact() {
  return !useMediaQuery("(min-width: 768px)", true);
}
