"use client";

import { useRef, useSyncExternalStore, type RefObject } from "react";
import { useLowData } from "@/hooks/useLowData";

/**
 * The shared, mutable state GSAP writes and the WebGL scene reads every frame. GSAP tweens plain
 * objects, so the DOM timeline and the 3D scene stay on one clock without React re-renders.
 *   intro   0 → 1: the entrance progress.
 *   scroll  0 → 1: how far the hero has scrolled out of view (ScrollTrigger).
 *   pointer -1 → 1 on both axes, viewport-relative; drives the inertia tilt.
 */
export interface StageBus {
  intro: number;
  scroll: number;
  pointer: { x: number; y: number };
}

export type StageBusRef = RefObject<StageBus>;

/** A bus that lives as long as the component (a ref: GSAP and the render loop mutate it freely). */
export function useStageBus(): StageBusRef {
  return useRef<StageBus>({ intro: 0, scroll: 0, pointer: { x: 0, y: 0 } });
}

let webgl: boolean | null = null;

/** Whether this browser can create a WebGL context at all (probed once, then released). */
export function canRenderWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Test helper. */
export function resetWebGLProbe() {
  webgl = null;
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  const mq = window.matchMedia?.(REDUCED);
  mq?.addEventListener?.("change", listener);
  return () => mq?.removeEventListener?.("change", listener);
}

/** Live `prefers-reduced-motion` (true during SSR, so the server always renders the static scene). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCED).matches ?? false,
    () => true,
  );
}

const noop = () => () => undefined;

/**
 * Whether to mount the WebGL scene: only on the client, with motion allowed, outside low-data mode
 * (three.js is the heaviest chunk on the page) and when WebGL exists. Everything else gets the
 * static gradient, without ever downloading the 3D code.
 */
export function useCanRender3D(): boolean {
  const reduced = useReducedMotion();
  const lowData = useLowData();
  const supported = useSyncExternalStore(noop, canRenderWebGL, () => false);
  return supported && !reduced && !lowData;
}
