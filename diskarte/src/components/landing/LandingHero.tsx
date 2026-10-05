"use client";

import { useRef, useState, type ReactNode } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/components/motion/gsap";
import { HeroCanvas } from "@/components/three/HeroCanvas";
import { useStageBus } from "@/components/three/stage-bus";
import { cn } from "@/lib/utils";

const WORD = "DISKARTE";

/**
 * "Flaunting Diskarte", the landing hero. One GSAP timeline drives the DOM and, through the shared
 * stage bus, the WebGL scene:
 *   1. the midnight scene lights up: solar dust spirals out and the glass salakot rises;
 *   2. the logo pops in and "DISKARTE" flips up letter by letter in extruded 3D type;
 *   3. scrolling hands progress to ScrollTrigger: the camera dollies back, the emblem turns away and
 *      the copy drifts up.
 * The headline, copy and calls to action are visible from the first paint (they are the LCP and the
 * point of the page); only decorative layers wait for the timeline, with a CSS failsafe.
 */
export function LandingHero({ header, children }: { header: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const stageRef = useStageBus();
  const [live, setLive] = useState(false);

  useGSAP(
    () => {
      const el = root.current!;
      const q = gsap.utils.selector(el);
      const done = () => {
        el.dataset.entrance = "done";
      };
      el.dataset.entrance = "running";

      if (prefersReducedMotion()) {
        gsap.set(q("[data-reveal]"), { autoAlpha: 1 });
        stageRef.current.intro = 1;
        done();
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "power4.out" }, onComplete: done });
      // Stage 1: the scene.
      tl.to(stageRef.current, { intro: 1, duration: 1.8, ease: "power3.out" }, 0).fromTo(
        q("[data-mascot]"),
        { autoAlpha: 0, scale: 0.8, y: 24 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 1.1 },
        0.1,
      );
      // Stage 2: logo, then the kinetic word.
      tl.fromTo(q("[data-logo]"), { autoAlpha: 0, scale: 0.5, rotate: -12 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.7)" }, 0.25).fromTo(
        q("[data-letter]"),
        { yPercent: 120, autoAlpha: 0, rotateX: -85 },
        { yPercent: 0, autoAlpha: 1, rotateX: 0, duration: 0.9, stagger: 0.045 },
        "<0.1",
      );

      // Stage 3: scroll. The scene reads raw progress and smooths it itself.
      ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom top", onUpdate: (self) => void (stageRef.current.scroll = self.progress) });
      gsap.to(q("[data-parallax]"), { yPercent: -8, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.5 } });

      // The extruded word leans toward the pointer (inertia via quickTo).
      const word = q("[data-kinetic]")[0];
      const rx = gsap.quickTo(word, "rotationX", { duration: 0.9, ease: "power3.out" });
      const ry = gsap.quickTo(word, "rotationY", { duration: 0.9, ease: "power3.out" });
      const onMove = (e: PointerEvent) => {
        rx(-((e.clientY / window.innerHeight) * 2 - 1) * 10);
        ry(((e.clientX / window.innerWidth) * 2 - 1) * 14);
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => window.removeEventListener("pointermove", onMove);
    },
    { scope: root },
  );

  return (
    <div ref={root} data-entrance="pending" className="relative isolate overflow-hidden">
      <HeroCanvas bus={stageRef} anchor={anchor} onSceneChange={setLive} className="-z-10 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" glowClassName="top-[30%] lg:left-[74%] lg:top-[52%]" />
      {header}

      <section className="relative mx-auto grid max-w-6xl items-center gap-8 px-5 pb-20 pt-4 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1.3fr_1fr] lg:gap-12 lg:pb-24">
        <div data-parallax>
          <div className="mb-6 flex items-center gap-3 [perspective:800px] sm:gap-4" aria-hidden>
            <div data-reveal data-logo className="shrink-0">
              <DiskarteLogo size={56} className="size-11 sm:size-14" />
            </div>
            <p data-kinetic className="kinetic-word flex select-none font-pixel text-2xl text-sun [transform-style:preserve-3d] min-[400px]:text-3xl sm:text-5xl">
              {WORD.split("").map((ch, i) => (
                <span key={i} data-reveal data-letter className="inline-block will-change-transform">
                  {ch}
                </span>
              ))}
            </p>
          </div>
          {children}
        </div>

        {/* The 3D emblem fits itself to this box; without WebGL the vector mascot holds the spot. */}
        <div ref={anchor} className="relative order-first mx-auto aspect-square w-44 sm:w-60 lg:order-none lg:w-full lg:max-w-[28rem]" aria-hidden>
          <div className={cn("absolute inset-[14%] transition-opacity duration-700", live && "opacity-0")}>
            <div data-reveal data-mascot className="size-full">
              <span className="absolute inset-0 -z-10 rounded-full bg-sun/25 blur-3xl" />
              <DiskarteLogo variant="mascot" className="size-full" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
