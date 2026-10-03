"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register once, client-side only. useGSAP gives scoped selectors and automatic cleanup
// (gsap.context revert) on unmount — safe with React 19 Strict Mode's double effects.
if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger);

export function prefersReducedMotion() {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

export { gsap, ScrollTrigger, useGSAP };
