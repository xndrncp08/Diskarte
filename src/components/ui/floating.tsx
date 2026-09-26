"use client";

import { useCallback, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";

export interface FloatingInput {
  anchor: { top: number; left: number; width: number; height: number };
  floating: { width: number; height: number };
  viewport: { width: number; height: number };
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
  const room: Record<Side, number> = {
    top: anchor.top - offset - padding,
    bottom: viewport.height - (anchor.top + anchor.height) - offset - padding,
    left: anchor.left - offset - padding,
    right: viewport.width - (anchor.left + anchor.width) - offset - padding,
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
    top: Math.round(clamp(top, padding, viewport.height - floating.height - padding)),
    left: Math.round(clamp(left, padding, viewport.width - floating.width - padding)),
    side: chosen,
  };
}

/**
 * Positions `floatingRef` next to `anchorRef` while `open`, re-measuring on scroll (any scroll
 * container, via capture) and resize. Returns fixed-position styles and the resolved side.
 */
export function useFloating(open: boolean, anchorRef: RefObject<HTMLElement | null>, floatingRef: RefObject<HTMLElement | null>, opts: { side: Side; align?: Align; offset?: number }) {
  const [position, setPosition] = useState<FloatingResult | null>(null);
  const { side, align, offset } = opts;

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const a = anchor.getBoundingClientRect();
    const f = floating.getBoundingClientRect();
    setPosition(
      computeFloatingPosition({
        anchor: { top: a.top, left: a.left, width: a.width, height: a.height },
        floating: { width: f.width || floating.offsetWidth, height: f.height || floating.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        side,
        align,
        offset,
      }),
    );
  }, [anchorRef, floatingRef, side, align, offset]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const frame = requestAnimationFrame(update); // re-measure once content/animation has laid out
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  const style: CSSProperties = position
    ? { position: "fixed", top: position.top, left: position.left }
    : { position: "fixed", top: 0, left: 0, visibility: "hidden" };
  return { style, side: position?.side ?? side, update };
}

/** Renders overlay content into <body> so no ancestor `overflow` or stacking context can clip it. */
export function FloatingPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
