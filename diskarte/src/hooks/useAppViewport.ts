"use client";

import { useEffect, type RefObject } from "react";

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
    };
  }, [ref]);
}
