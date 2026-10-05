"use client";

import type { RefObject } from "react";
import { SETTLED, type StageBusRef } from "@/components/three/stage-bus";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "./gsap";

const SEEN_KEY = "diskarte:entrance-seen";

/**
 * "Flaunting Diskarte": one GSAP timeline for the DOM and both WebGL canvases (through the stage bus).
 *   1. Midnight: the particle mesh rises and the ambient glow blooms.
 *   2. The 3D mascot scales in while the camera orbits round to face it; a sunbeam flash peaks as
 *      it lands, then "DISKARTE" rises letter by letter.
 *   3. The glass auth card floats in.
 * Elements opt in with `data-reveal="glow" | "logo" | "letter" | "tagline" | "card"`; until the
 * timeline takes them over, CSS keeps them hidden (with a failsafe). The full show plays once per
 * session, later visits get a 2.5× version, and reduced motion gets a plain fade with everything
 * settled. Only opacity and transforms animate.
 */
export function useFlauntingEntrance(rootRef: RefObject<HTMLElement | null>, stageRef: StageBusRef, { scroll = false }: { scroll?: boolean } = {}) {
  useGSAP(
    () => {
      const el = rootRef.current!;
      const q = gsap.utils.selector(el);
      const done = () => {
        el.dataset.entrance = "done";
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Storage blocked: the next visit plays the full show again.
        }
      };
      el.dataset.entrance = "running";

      if (prefersReducedMotion()) {
        Object.assign(stageRef.current, SETTLED);
        gsap.set(q("[data-reveal]"), { autoAlpha: 1 });
        gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: "none", onComplete: done });
        return;
      }

      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === "1";
      } catch {
        // ignore
      }
      const tl = gsap.timeline({ defaults: { ease: "power4.out" }, onComplete: done });
      if (seen) tl.timeScale(2.5);

      // Stage 1: midnight canvas.
      tl.to(stageRef.current, { field: 1, duration: 1.8, ease: "power2.out" }, 0).fromTo(
        q("[data-reveal='glow']"),
        { autoAlpha: 0, scale: 0.7 },
        { autoAlpha: 1, scale: 1, duration: 1.4, ease: "power2.out" },
        0,
      );

      // Stage 2: the mascot (scale, entry orbit, brightness), then the split word.
      tl.fromTo(q("[data-reveal='logo']"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: "none" }, 0.2)
        .to(stageRef.current, { orbit: 1, duration: 1.9, ease: "power3.inOut" }, 0.2)
        .to(stageRef.current, { logo: 1, duration: 1.2, ease: "back.out(1.4)" }, 0.3)
        .to(stageRef.current, { glow: 1.7, duration: 0.45, ease: "power2.out" }, 1.15)
        .to(stageRef.current, { glow: 1, duration: 1, ease: "sine.inOut" }, ">")
        .fromTo(q("[data-reveal='letter']"), { autoAlpha: 0, yPercent: 70 }, { autoAlpha: 1, yPercent: 0, duration: 0.8, stagger: 0.05 }, 1.0)
        .fromTo(q("[data-reveal='tagline']"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.08 }, "-=0.5");

      // Stage 3: the glass card floats in.
      tl.fromTo(q("[data-reveal='card']"), { autoAlpha: 0, y: 40, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1, ease: "power3.out" }, "-=0.45");

      if (scroll) {
        // The scenes read raw progress and smooth it themselves.
        ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom top", onUpdate: (self) => void (stageRef.current.scroll = self.progress) });
      }
    },
    { scope: rootRef },
  );
}
