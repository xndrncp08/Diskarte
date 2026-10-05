"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useCanRender3D, type StageBusRef } from "./stage-bus";

// three.js + R3F + drei only download when the scene is actually going to render. While the chunk
// loads, the static sun below is the loading state (the canvas fades in over it on its first frame).
const SolarScene = dynamic(() => import("./SolarScene"), { ssr: false, loading: () => null });

export interface HeroCanvasProps {
  bus: StageBusRef;
  anchor?: RefObject<HTMLElement | null>;
  /** The glass salakot; without it, only the particle field. */
  emblem?: boolean;
  /** Where the static fallback's sun glow sits (Tailwind position classes). */
  glowClassName?: string;
  className?: string;
  /** Called with true once the 3D scene has drawn its first frame, false while the static fallback shows. */
  onSceneChange?: (live: boolean) => void;
}

/**
 * Decorative background layer: the WebGL solar scene when the browser can and the visitor allows
 * motion; otherwise (reduced motion, low-data mode, no WebGL, a lost GPU context) a static
 * high-resolution gradient sun. Never interactive, never announced.
 */
export function HeroCanvas({ bus, anchor, emblem = true, glowClassName, className, onSceneChange }: HeroCanvasProps) {
  const capable = useCanRender3D();
  const [lost, setLost] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const use3D = capable && !lost;
  const live = use3D && drawn;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const notify = useRef(onSceneChange);
  useEffect(() => {
    notify.current = onSceneChange;
  }, [onSceneChange]);
  useEffect(() => {
    notify.current?.(live);
  }, [live]);

  const onReady = useCallback(() => setDrawn(true), []);
  const onContextLost = useCallback(() => setLost(true), []);

  return (
    <div ref={root} aria-hidden data-scene={live ? "3d" : "static"} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <StaticSun glowClassName={glowClassName} behind3D={live} />
      {use3D && (
        <div className={cn("absolute inset-0 transition-opacity duration-1000 ease-out", drawn ? "opacity-100" : "opacity-0")}>
          <SolarScene bus={bus} anchor={anchor} emblem={emblem} active={onScreen} onReady={onReady} onContextLost={onContextLost} />
        </div>
      )}
    </div>
  );
}

/**
 * Resolution-independent gradient sun: eight soft rays, a gold core and a faint dust texture. Behind a
 * live 3D scene only the glow remains (the scene draws its own rays and dust).
 */
export function StaticSun({ glowClassName, behind3D = false }: { glowClassName?: string; behind3D?: boolean }) {
  return (
    <div className={cn("absolute left-1/2 top-1/3 size-[56rem] max-w-none -translate-x-1/2 -translate-y-1/2", glowClassName)} data-testid="static-sun">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(255_184_0/0.32)_0%,rgb(245_158_11/0.14)_26%,rgb(6_182_212/0.06)_48%,transparent_68%)]" />
      <div className={cn("absolute inset-0 transition-opacity duration-1000", behind3D && "opacity-0")}>
        <div className="absolute inset-[12%] rounded-full bg-[repeating-conic-gradient(from_-11.25deg,rgb(255_184_0/0.16)_0deg_6deg,transparent_6deg_45deg)] [mask-image:radial-gradient(circle,transparent_18%,black_30%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgb(255_184_0/0.5)_1px,transparent_1.5px)] bg-[length:28px_28px] opacity-40 [mask-image:radial-gradient(circle,black_10%,transparent_60%)]" />
      </div>
    </div>
  );
}
