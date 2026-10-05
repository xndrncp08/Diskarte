"use client";

import { useRef, type ReactNode } from "react";
import { GLASS_CARD, SplitWordmark } from "@/components/brand/BrandStage";
import { useFlauntingEntrance } from "@/components/motion/useFlauntingEntrance";
import { Diskarte3DLogo } from "@/components/three/Diskarte3DLogo";
import { ParticleBackdrop } from "@/components/three/ParticleBackdrop";
import { useStageBus } from "@/components/three/stage-bus";
import { cn } from "@/lib/utils";

/**
 * Landing hero: the 3D mascot as the centrepiece over the particle mesh, the split "DISKARTE" word,
 * the headline, and the glass auth card beside it (below it on phones). The headline and copy are
 * plain HTML visible from the first paint; the 3D layers sit behind and never cover a control.
 */
export function LandingHero({ header, card, children }: { header: ReactNode; card: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const stageRef = useStageBus();
  useFlauntingEntrance(root, stageRef, { scroll: true });

  return (
    <div ref={root} data-entrance="pending" className="relative isolate overflow-hidden">
      <ParticleBackdrop bus={stageRef} className="-z-10 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" glowClassName="top-[30%] lg:left-[32%]" />
      {header}

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-2 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1fr_26rem] lg:gap-14 lg:pb-16">
        <div className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
          <span
            data-reveal="glow"
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[22%] -z-10 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun/15 blur-3xl lg:left-[11rem]"
          />
          <div data-reveal="logo" className="-mb-2">
            <Diskarte3DLogo bus={stageRef} className="size-56 sm:size-64 lg:size-80" />
          </div>
          <SplitWordmark className="mb-6 text-4xl sm:text-5xl lg:justify-start" />
          {children}
        </div>

        <div id="sign-in" data-reveal="card" className="w-full max-w-md scroll-mt-6 justify-self-center lg:justify-self-end">
          <div className={cn(GLASS_CARD, "p-6 sm:p-8")}>{card}</div>
        </div>
      </section>
    </div>
  );
}
