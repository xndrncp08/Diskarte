"use client";

import { useRef, type ReactNode } from "react";
import { GLASS_CARD, SplitWordmark } from "@/components/brand/BrandStage";
import { Diskarte3DLogo } from "@/components/three/Diskarte3DLogo";
import { ParticleBackdrop } from "@/components/three/ParticleBackdrop";
import { useStageBus } from "@/components/three/stage-bus";
import { cn } from "@/lib/utils";
import { useFlauntingEntrance } from "./useFlauntingEntrance";

/**
 * The sign-in / sign-up / password pages: midnight particle mesh, the 3D mascot, "DISKARTE" in split
 * type, then the glass card with the form (see `useFlauntingEntrance`).
 */
export function AuthEntrance({ tagline, footer, children }: { tagline: string; footer?: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const stageRef = useStageBus();
  useFlauntingEntrance(root, stageRef);

  return (
    <div ref={root} data-entrance="pending" className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8 sm:py-10">
      <ParticleBackdrop bus={stageRef} className="-z-10" glowClassName="top-[18%]" />
      <span data-reveal="glow" aria-hidden className="pointer-events-none absolute left-1/2 top-[16%] -z-10 size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun/15 blur-3xl" />

      <div data-reveal="logo">
        <Diskarte3DLogo bus={stageRef} className="size-36 sm:size-44" />
      </div>
      <SplitWordmark className="mt-1 text-3xl sm:text-4xl" />
      <p data-reveal="tagline" className="mb-7 mt-3 text-center font-silk text-[10px] uppercase tracking-widest text-slate-400">
        {tagline}
      </p>

      <div data-reveal="card" className="relative w-full max-w-md">
        <div className={cn(GLASS_CARD, "p-6 sm:p-8")}>{children}</div>
        {footer}
      </div>
    </div>
  );
}
