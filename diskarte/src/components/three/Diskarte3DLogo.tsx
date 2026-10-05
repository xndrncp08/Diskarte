"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { cn } from "@/lib/utils";
import { SETTLED, useCanRender3D, useOnScreen, useStageBus, type StageBusRef } from "./stage-bus";

// three.js, R3F and drei download only when the 3D logo will actually render. The skeleton below
// holds the logo's exact box while the chunk loads and the shaders compile.
const MascotScene = dynamic(() => import("./MascotScene"), { ssr: false, loading: () => null });

export interface Diskarte3DLogoProps {
  /** Timeline channels (scale, entry orbit, brightness). Without one, the logo appears settled. */
  bus?: StageBusRef;
  /** Size the box with classes (it must have a definite size: the canvas fills it). */
  className?: string;
}

/**
 * The Diskarte mascot in real-time 3D. Decorative (hidden from assistive tech, never interactive).
 * Reduced motion, low-data mode, missing WebGL or a lost GPU context get the vector mascot instead,
 * with a plain CSS fade.
 */
export function Diskarte3DLogo({ bus, className }: Diskarte3DLogoProps) {
  const settled = useStageBus(SETTLED);
  const stageRef = bus ?? settled;
  const capable = useCanRender3D();
  const [lost, setLost] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  const use3D = capable && !lost;

  const onReady = useCallback(() => setDrawn(true), []);
  const onContextLost = useCallback(() => setLost(true), []);

  return (
    <div ref={box} aria-hidden data-logo3d={use3D ? (drawn ? "3d" : "loading") : "static"} className={cn("pointer-events-none relative", className)}>
      {use3D ? (
        <>
          <MascotSkeleton className={cn("transition-opacity duration-500", drawn && "opacity-0")} />
          <div className={cn("absolute inset-0 transition-opacity duration-700", drawn ? "opacity-100" : "opacity-0")}>
            <MascotScene bus={stageRef} active={onScreen} onReady={onReady} onContextLost={onContextLost} />
          </div>
        </>
      ) : (
        <div className="fade-soft absolute inset-[8%]">
          <span className="absolute inset-[12%] -z-10 rounded-full bg-[radial-gradient(circle,rgb(255_184_0/0.35),transparent_70%)] blur-2xl" />
          <DiskarteLogo variant="mascot" className="size-full" />
        </div>
      )}
    </div>
  );
}

/**
 * Geometric placeholder in the mascot's silhouette (sun, salakot, bubble), shimmering softly while
 * WebGL spins up. Same box as the canvas, so nothing shifts when the model appears.
 */
export function MascotSkeleton({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("absolute inset-0 size-full animate-pulse", className)} data-testid="logo-skeleton">
      <g fill="none" stroke="rgb(255 184 0 / 0.28)" strokeWidth="6" strokeLinejoin="round">
        <circle cx="344" cy="176" r="64" fill="rgb(255 184 0 / 0.08)" />
        {[-165, -120, -75, -30, 15, 60].map((a) => {
          const r = (a * Math.PI) / 180;
          return <line key={a} x1={344 + Math.cos(r) * 82} y1={176 + Math.sin(r) * 82} x2={344 + Math.cos(r) * 150} y2={176 + Math.sin(r) * 150} strokeLinecap="round" />;
        })}
        <g transform="rotate(-7 261 316)" fill="rgb(255 255 255 / 0.05)" stroke="rgb(255 255 255 / 0.18)">
          <rect x="148" y="236" width="226" height="160" rx="50" />
          <path d="M244 396 Q206 404 172 446 Q170 404 148 340" />
        </g>
        <path d="M196 104 L70 296 Q246 250 398 212 Z" fill="rgb(255 184 0 / 0.08)" />
      </g>
    </svg>
  );
}
