"use client";

import { useEffect, type RefObject } from "react";

/**
 * How much taller the screen is than the layout viewport in an installed iPhone app. iOS
 * (standalone mode) can make the viewport — and so 100dvh and `position: fixed; inset: 0` —
 * shorter than the screen, leaving an empty strip at the bottom. Only for a full-screen app window
 * with a small shortfall (the status-bar height), so iPad split view and Android are untouched.
 */
export function standaloneFill(nav: { standalone?: boolean }, win: { innerWidth: number; innerHeight: number }, scr: { width: number; height: number }, portrait: boolean) {
  if (nav.standalone !== true) return null;
  const width = portrait ? Math.min(scr.width, scr.height) : Math.max(scr.width, scr.height);
  const height = portrait ? Math.max(scr.width, scr.height) : Math.min(scr.width, scr.height);
  const short = height - win.innerHeight;
  return Math.abs(win.innerWidth - width) <= 2 && short > 1 && short <= 120 ? height : null;
}

/** VisualViewport covers Safari's keyboard, where dvh alone still includes the covered area. */
export function useAppViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const el = ref.current;
      if (!el || (viewport && viewport.scale !== 1)) return; // Keep pinch zoom available.
      const height = viewport?.height ?? window.innerHeight;
      el.style.setProperty("--app-height", `${height}px`);
      el.style.setProperty("--app-top", `${viewport?.offsetTop ?? 0}px`);
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.style.setProperty("--app-top", `${viewport?.offsetTop ?? 0}px`);
      const keyboard = String(window.innerHeight - height > 120);
      el.dataset.keyboard = keyboard;
      // Dialog layers live outside the shell; they size to the visible area only with the keyboard up.
      document.documentElement.dataset.keyboard = keyboard;
      const fill = keyboard === "false" ? standaloneFill(navigator as { standalone?: boolean }, window, window.screen, window.matchMedia?.("(orientation: portrait)").matches ?? true) : null;
      if (fill) document.documentElement.style.setProperty("--app-fill", `${fill}px`);
      else document.documentElement.style.removeProperty("--app-fill");
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-top");
      delete document.documentElement.dataset.keyboard;
      document.documentElement.style.removeProperty("--app-fill");
    };
  }, [ref]);
}
