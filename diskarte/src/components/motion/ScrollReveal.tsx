"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "./gsap";

/**
 * Reveals `[data-scroll-reveal]` descendants as they scroll into view (ScrollTrigger.batch, opacity and
 * transform only). Anything already on screen when the page loads is never hidden, so nothing flashes;
 * reduced motion skips it entirely.
 */
export function ScrollReveal({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const below = gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]", root.current).filter((el) => el.getBoundingClientRect().top > window.innerHeight);
      if (below.length === 0) return;
      gsap.set(below, { autoAlpha: 0, y: 32 });
      ScrollTrigger.batch(below, {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power4.out", stagger: 0.08, overwrite: true }),
      });
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
