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

/**
 * The shell always spans to the bottom of the screen (`full`); `obscured` is how much of that the
 * browser's own bottom bar (iOS Safari's toolbar) currently covers, so content can sit above it
 * while the background runs underneath. Shrinks to 0 as the bar collapses. The installed iPhone
 * app has no bar: its short viewport is the iOS bug `fill` corrects, not something covering it.
 */
export function bottomLayout(opts: { fill: number | null; large: number; innerHeight: number; visibleBottom: number }) {
  const full = opts.fill ?? Math.max(opts.large, opts.innerHeight);
  const obscured = opts.fill ? 0 : Math.min(200, Math.max(0, Math.round(full - opts.visibleBottom)));
  return { full, obscured };
}

/** VisualViewport covers Safari's keyboard, where dvh alone still includes the covered area. */
export function useAppViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    // Measures the large viewport (browser bars retracted) in px.
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
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
      const { full, obscured } = bottomLayout({ fill, large: probe.offsetHeight, innerHeight: window.innerHeight, visibleBottom: (viewport?.offsetTop ?? 0) + height });
      const root = document.documentElement.style;
      root.setProperty("--app-full", `${full}px`);
      root.setProperty("--app-obscured", keyboard === "true" ? "0px" : `${obscured}px`);
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
      document.documentElement.style.removeProperty("--app-full");
      document.documentElement.style.removeProperty("--app-obscured");
      probe.remove();
    };
  }, [ref]);
}
