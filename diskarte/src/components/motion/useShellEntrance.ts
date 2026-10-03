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
 * The dock and the floating cards rise in, staggered, the first time the shell mounts after sign-in.
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
      const cards = gsap.utils.toArray<HTMLElement>("[data-testid='micro-dock'], #main-content > *", scope.current);
      gsap.from(cards, { autoAlpha: 0, y: 24, scale: 0.97, duration: 0.6, ease: "power4.out", stagger: 0.07, clearProps: "opacity,visibility,transform" });
    },
    { scope },
  );
}
