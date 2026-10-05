"use client";

import type { RefObject } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

/** Set by the sign-in form; the app shell plays its entrance once, right after signing in. */
export const ENTERING_KEY = "diskarte:entering";

export function markEntering() {
  try {
    sessionStorage.setItem(ENTERING_KEY, "1");
  } catch {
    // Storage blocked: the shell simply appears without the flourish.
  }
}

/**
 * The command rail and the workspace panels come in, staggered, the first time the shell mounts after sign-in.
 * It mounts through a client-side navigation, so this runs before the first paint (no flash).
 */
export function useShellEntrance(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      let entering = false;
      try {
        entering = sessionStorage.getItem(ENTERING_KEY) === "1";
        sessionStorage.removeItem(ENTERING_KEY);
      } catch {
        return;
      }
      if (!entering || prefersReducedMotion()) return;
      // The rail rises in; panels only fade (their position is a CSS transform GSAP must not overwrite).
      const rail = gsap.utils.toArray<HTMLElement>("[data-testid='micro-dock']", scope.current);
      const panels = gsap.utils.toArray<HTMLElement>("[data-panel]:not([data-minimized])", scope.current);
      gsap.from(rail, { autoAlpha: 0, y: 24, duration: 0.6, ease: "power4.out", clearProps: "opacity,visibility,transform" });
      gsap.from(panels, { autoAlpha: 0, duration: 0.6, ease: "power2.out", stagger: 0.08, delay: 0.1, clearProps: "opacity,visibility" });
    },
    { scope },
  );
}
