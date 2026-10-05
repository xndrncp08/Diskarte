"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCanRender3D, useOnScreen, type StageBusRef } from "./stage-bus";

const ParticleMeshScene = dynamic(() => import("./ParticleMeshScene"), { ssr: false, loading: () => null });

/**
 * Full-bleed decorative backdrop: a midnight base with an ambient radial glow, and the WebGL
 * particle mesh on top when motion is allowed (otherwise the glow alone: a static gradient).
 * Never interactive, never announced.
 */
export function ParticleBackdrop({ bus, className, glowClassName }: { bus: StageBusRef; className?: string; glowClassName?: string }) {
  const capable = useCanRender3D();
  const [lost, setLost] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(root);
  const use3D = capable && !lost;
  const onReady = useCallback(() => setDrawn(true), []);
  const onContextLost = useCallback(() => setLost(true), []);

  return (
    <div ref={root} aria-hidden data-backdrop={use3D && drawn ? "3d" : "static"} className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-abyss", className)}>
      <div
        data-testid="ambient-glow"
        className={cn(
          "absolute left-1/2 top-[30%] size-[64rem] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_184_0/0.2)_0%,rgb(245_158_11/0.08)_30%,rgb(6_182_212/0.05)_52%,transparent_70%)]",
          glowClassName,
        )}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgb(6_182_212/0.08),transparent_70%)]" />
      {use3D && (
        <div className={cn("absolute inset-0 transition-opacity duration-1000", drawn ? "opacity-100" : "opacity-0")}>
          <ParticleMeshScene bus={bus} active={onScreen} onReady={onReady} onContextLost={onContextLost} />
        </div>
      )}
    </div>
  );
}
