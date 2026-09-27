"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#FFB800", "#FFFFFF", "#0038A8", "#CE1126", "#22C55E", "#38BDF8"];

interface Pixel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  spin: number;
}

/**
 * Retro pixel confetti: square "pixels" launched from the bottom corners, falling with gravity,
 * drawn with image smoothing off. Honours prefers-reduced-motion (renders nothing).
 */
export function Confetti({ pieces = 140, duration = 3200 }: { pieces?: number; duration?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      el.width = window.innerWidth * dpr;
      el.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => el.width / dpr;
    const h = () => el.height / dpr;
    const burst = (fromLeft: boolean): Pixel => ({
      x: fromLeft ? 0 : w(),
      y: h() * 0.85,
      vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
      vy: -(9 + Math.random() * 9),
      size: [6, 8, 10][Math.floor(Math.random() * 3)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      spin: Math.random() < 0.5 ? 0 : 1,
    });
    const pixels = Array.from({ length: pieces }, (_, i) => burst(i % 2 === 0));

    let frame = 0;
    const started = performance.now();
    const tick = (t: number) => {
      const elapsed = t - started;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w(), h());
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - duration * 0.7) / (duration * 0.3));
      for (const p of pixels) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillStyle = p.color;
        // 8-bit "spin": alternate between a square and a flat bar every few frames.
        const flat = p.spin && Math.floor(elapsed / 90) % 2 === 0;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, flat ? p.size / 2 : p.size);
      }
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w(), h());
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [pieces, duration]);

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden data-testid="confetti" />;
}
