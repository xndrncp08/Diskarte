"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { SETTLED, useCanRender3D, useStageBus } from "@/components/three/stage-bus";
import { cn } from "@/lib/utils";
import { useIsCanvas } from "./WorkspaceProvider";

const SolarFieldScene = dynamic(() => import("@/components/three/SolarFieldScene"), { ssr: false, loading: () => null });

/**
 * The workspace's living backdrop behind the glass panels: a GPU solar particle field with a gold
 * light that follows the cursor. Only on the floating canvas (tablet and up), only with motion
 * allowed, outside low-data mode and with WebGL; otherwise the shell's static gradient shows through.
 */
export function DiskarteCanvasBackground() {
  const isCanvas = useIsCanvas();
  const capable = useCanRender3D();
  const stageRef = useStageBus(SETTLED);
  const [lost, setLost] = useState(false);
  const [shown, setShown] = useState(false);
  const onContextLost = useCallback(() => setLost(true), []);
  const active = isCanvas && capable && !lost;
  useEffect(() => {
    if (!active) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [active]);
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-testid="canvas-background"
      className={cn("pointer-events-none absolute inset-0 transition-opacity duration-1000", shown ? "opacity-100" : "opacity-0")}
    >
      <SolarFieldScene bus={stageRef} onContextLost={onContextLost} />
    </div>
  );
}
