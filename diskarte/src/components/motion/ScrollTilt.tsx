"use client";

import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

/**
 * Scroll-scrubbed 3D settle: the child starts tipped back in perspective and lands flat as it reaches
 * the middle of the viewport (transform only). Reduced motion leaves it flat.
 */
export function ScrollTilt({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        root.current!.firstElementChild,
        { rotateX: 24, scale: 0.9, y: 48, transformPerspective: 1400, transformOrigin: "50% 100%" },
        { rotateX: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: root.current, start: "top 95%", end: "center 55%", scrub: 0.6 } },
      );
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
