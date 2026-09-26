"use client";

import { useRef, type TouchEvent } from "react";

const EDGE = 28; // px from the left edge where an "open" swipe may start
const DISTANCE = 56; // horizontal travel needed to trigger
const MAX_SLOPE = 0.6; // |dy/dx| above this is a vertical scroll, not a swipe

/**
 * Mobile drawer gestures: swipe right from the left edge to open the navigation drawer, swipe left
 * anywhere to close it. Vertical scrolling (chat) is left alone. Desktop (≥ md) ignores gestures.
 */
export function useSwipeDrawer(open: boolean, setOpen: (open: boolean) => void) {
  const start = useRef<{ x: number; y: number; eligible: boolean } | null>(null);

  function isMobile() {
    return typeof window !== "undefined" && !window.matchMedia?.("(min-width: 768px)").matches;
  }

  return {
    onTouchStart(e: TouchEvent) {
      if (!isMobile() || e.touches.length !== 1) return;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY, eligible: open || t.clientX <= EDGE };
    },
    onTouchMove(e: TouchEvent) {
      const s = start.current;
      if (!s?.eligible) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dy) > Math.abs(dx) * MAX_SLOPE && Math.abs(dy) > 12) {
        start.current = null; // vertical scroll wins
        return;
      }
      if (!open && dx > DISTANCE) {
        setOpen(true);
        start.current = null;
      } else if (open && dx < -DISTANCE) {
        setOpen(false);
        start.current = null;
      }
    },
    onTouchEnd() {
      start.current = null;
    },
  };
}
