"use client";

import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface FloatingInput {
  anchor: { top: number; left: number; width: number; height: number };
  floating: { width: number; height: number };
  viewport: { width: number; height: number; top?: number; left?: number };
  side: Side;
  align?: Align;
  offset?: number;
  padding?: number;
}

export interface FloatingResult {
  top: number;
  left: number;
  side: Side;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Pure placement maths for popovers rendered in a fixed-position portal:
 * 1. put the panel on the preferred side of the anchor;
 * 2. flip to the opposite side if it would overflow the viewport there and fits better on the other;
 * 3. clamp both axes inside the viewport (minus padding) so it never creates scrollbars.
 */
export function computeFloatingPosition({ anchor, floating, viewport, side, align = "start", offset = 8, padding = 8 }: FloatingInput): FloatingResult {
  const viewTop = viewport.top ?? 0, viewLeft = viewport.left ?? 0;
  const room: Record<Side, number> = {
    top: anchor.top - viewTop - offset - padding,
    bottom: viewTop + viewport.height - (anchor.top + anchor.height) - offset - padding,
    left: anchor.left - viewLeft - offset - padding,
    right: viewLeft + viewport.width - (anchor.left + anchor.width) - offset - padding,
  };
  const needed = (s: Side) => (s === "top" || s === "bottom" ? floating.height : floating.width);
  let chosen = side;
  if (room[side] < needed(side) && room[OPPOSITE[side]] > room[side]) chosen = OPPOSITE[side];

  let top: number;
  let left: number;
  if (chosen === "top" || chosen === "bottom") {
    top = chosen === "bottom" ? anchor.top + anchor.height + offset : anchor.top - offset - floating.height;
    left = align === "start" ? anchor.left : align === "end" ? anchor.left + anchor.width - floating.width : anchor.left + anchor.width / 2 - floating.width / 2;
  } else {
    left = chosen === "right" ? anchor.left + anchor.width + offset : anchor.left - offset - floating.width;
    top = align === "start" ? anchor.top : align === "end" ? anchor.top + anchor.height - floating.height : anchor.top + anchor.height / 2 - floating.height / 2;
  }

  return {
    top: Math.round(clamp(top, viewTop + padding, viewTop + viewport.height - floating.height - padding)),
    left: Math.round(clamp(left, viewLeft + padding, viewLeft + viewport.width - floating.width - padding)),
    side: chosen,
  };
}

export function visibleViewport() {
  const view = window.visualViewport;
  return { width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight, top: view?.offsetTop ?? 0, left: view?.offsetLeft ?? 0 };
}

/**
 * Positions `floatingRef` next to `anchorRef` while `open`, re-measuring on scroll (any scroll
 * container, via capture) and resize. Returns fixed-position styles and the resolved side.
 */
export function useFloating(open: boolean, anchorRef: RefObject<HTMLElement | null>, floatingRef: RefObject<HTMLElement | null>, opts: { side: Side; align?: Align; offset?: number }) {
  const [position, setPosition] = useState<(FloatingResult & { maxWidth: number; maxHeight: number }) | null>(null);
  const { side, align, offset } = opts;

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    const viewport = visibleViewport();
    const next = {
      ...computeFloatingPosition({
        anchor: { top: a.top, left: a.left, width: a.width, height: a.height },
        floating: { width: floating.offsetWidth || f.width, height: floating.offsetHeight || f.height },
        viewport,
        side,
        align,
        offset,
      }), maxWidth: Math.max(0, viewport.width - 16), maxHeight: Math.max(0, viewport.height - 16),
    };
    setPosition((previous) => previous && Object.keys(next).every((key) => next[key as keyof typeof next] === previous[key as keyof typeof next]) ? previous : next);
  }, [anchorRef, floatingRef, side, align, offset]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const frame = requestAnimationFrame(update); // re-measure once content/animation has laid out
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (floatingRef.current) observer.observe(floatingRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [open, update, anchorRef, floatingRef]);

  const style: CSSProperties = position
    ? { position: "fixed", top: position.top, left: position.left, maxWidth: position.maxWidth, maxHeight: position.maxHeight, overflowY: "auto" }
    : { position: "fixed", top: 0, left: 0, visibility: "hidden" };
  return { style, side: position?.side ?? side, update };
}

/** Renders overlay content into <body> so no ancestor `overflow` or stacking context can clip it. */
export function FloatingPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
