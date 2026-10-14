"use client";

import { useRef, type PointerEvent } from "react";

/** Horizontal intent wins only outside controls and the navigation edge; vertical scrolling stays native. */
export function useSwipeReply(reply: () => void, disabled = false) {
  const gesture = useRef<{ id: number; x: number; y: number; distance: number } | null>(null);
  const reset = (el: HTMLElement) => { el.style.transform = ""; gesture.current = null; };
  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (disabled || e.pointerType !== "touch" || !e.isPrimary || e.clientX <= 28 || (e.target as Element).closest("button,a,input,textarea,[role=menu]")) return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, distance: 0 };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return reset(e.currentTarget);
      if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        g.distance = dx;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.style.transform = `translateX(${Math.min(72, dx * 0.6)}px)`;
      }
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g?.id === e.pointerId && g.distance >= 72) reply();
      reset(e.currentTarget);
    },
    onPointerCancel(e: PointerEvent<HTMLElement>) { reset(e.currentTarget); },
  };
}
