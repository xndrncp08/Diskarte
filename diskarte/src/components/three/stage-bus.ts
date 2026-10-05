"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useLowData } from "@/hooks/useLowData";

/**
 * The shared, mutable state GSAP writes and the WebGL scenes read every frame. GSAP tweens plain
 * objects, so one timeline drives the DOM and both canvases without React re-renders.
 *   field   0 → 1: the backdrop particle mesh rising into place.
 *   logo    0 → 1 (back eases overshoot): the mascot's scale.
 *   orbit   0 → 1: the camera's entry orbit, from high on the left round to the front.
 *   glow    0 → 1 (flashes above 1): material brightness, lights and sunbeams.
 *   scroll  0 → 1: how far the hero has scrolled away.
 *   pointer -1 → 1 on both axes, viewport-relative: the inertia tilt and the moving key light.
 */
export interface StageBus {
  field: number;
  logo: number;
  orbit: number;
  glow: number;
  scroll: number;
  pointer: { x: number; y: number };
}

export type StageBusRef = RefObject<StageBus>;

export const SETTLED: Omit<StageBus, "pointer" | "scroll"> = { field: 1, logo: 1, orbit: 1, glow: 1 };

/** A bus that lives as long as the component (a ref: GSAP and the render loops mutate it freely). */
export function useStageBus(initial?: Partial<Omit<StageBus, "pointer">>): StageBusRef {
  return useRef<StageBus>({ field: 0, logo: 0, orbit: 0, glow: 0, scroll: 0, ...initial, pointer: { x: 0, y: 0 } });
}

/** Keeps `bus.pointer` in step with the mouse / touch position while a scene is mounted. */
export function usePointerTracking(bus: StageBusRef) {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      bus.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      bus.current.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [bus]);
}

/** Pauses a canvas while its box is off screen. */
export function useOnScreen<T extends Element>(ref: RefObject<T | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
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
