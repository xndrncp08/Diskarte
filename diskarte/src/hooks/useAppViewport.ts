"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keyboard only. The shell is plain 100dvh (the browser keeps that right as its toolbars move);
 * iOS doesn't shrink dvh for the on-screen keyboard, so while it's up the shell and dialog layers
 * size to the visual viewport (`data-keyboard`, `--app-height`, `--app-top`) to keep inputs visible.
 */
export function useAppViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const el = ref.current;
      if (!el || (viewport && viewport.scale !== 1)) return; // Keep pinch zoom available.
      const height = viewport?.height ?? window.innerHeight;
      const top = `${viewport?.offsetTop ?? 0}px`;
      for (const style of [el.style, root.style]) {
        style.setProperty("--app-height", `${height}px`);
        style.setProperty("--app-top", top);
      }
      const keyboard = String(window.innerHeight - height > 120);
      el.dataset.keyboard = keyboard;
      root.dataset.keyboard = keyboard;
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
      delete root.dataset.keyboard;
    };
  }, [ref]);
}
