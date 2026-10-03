"use client";

import { useRef, type ReactNode } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

const WORD = "DISKARTE";
const SEEN_KEY = "diskarte:entrance-seen";
// A 12 × 6 grid of light points: the "particle grid" drifting behind the logo.
const PARTICLES = Array.from({ length: 72 }, (_, i) => ({ x: ((i % 12) + 0.5) / 12, y: (Math.floor(i / 12) + 0.5) / 6 }));

/**
 * "Flaunting Diskarte": the sign-in entrance. One GSAP timeline, compositor-only (opacity and
 * transforms, plus SVG stroke drawing):
 *   1. midnight viewport, ambient radial backlight and a particle grid fading up;
 *   2. the salakot mascot scales in while its outlines draw themselves, with a golden glow pulse;
 *   3. "DISKARTE" rises letter by letter (stagger 0.04, power4.out);
 *   4. the glass card lifts in (autoAlpha, y, scale 0.95 → 1).
 * The full show plays once per session; later visits get a quick version, and reduced motion gets
 * an instant fade. Until the timeline takes over, CSS keeps the stages hidden (with a failsafe).
 */
export function AuthEntrance({ tagline, children }: { tagline: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = root.current!;
      const q = gsap.utils.selector(el);
      const done = () => {
        el.dataset.entrance = "done";
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Storage blocked: the next visit just plays the full show again.
        }
      };
      el.dataset.entrance = "running";

      if (prefersReducedMotion()) {
        gsap.set(q("[data-reveal]"), { autoAlpha: 1 });
        gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, onComplete: done });
        return;
      }

      let seen = false;
      try {
        seen = sessionStorage.getItem(SEEN_KEY) === "1";
      } catch {
        // ignore
      }
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      if (seen) tl.timeScale(2.5);

      // Stage 1 — backlight + particles.
      tl.fromTo(q("[data-backlight]"), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "power2.out" }).fromTo(
        q("[data-particle]"),
        { autoAlpha: 0, scale: 0 },
        { autoAlpha: () => gsap.utils.random(0.15, 0.7), scale: 1, duration: 0.5, stagger: { each: 0.006, from: "center", grid: [6, 12] } },
        "<0.1",
      );

      // Stage 2 — logo, with its outlines drawing in.
      const strokes = Array.from(el.querySelectorAll<SVGGeometryElement>("[data-logo] [stroke]"));
      const lengths = strokes.map((s) => (typeof s.getTotalLength === "function" ? s.getTotalLength() : 0));
      tl.fromTo(q("[data-logo]"), { autoAlpha: 0, scale: 0.55, rotate: -10 }, { autoAlpha: 1, scale: 1, rotate: 0, duration: 0.8, ease: "back.out(1.6)" }, "-=0.55")
        .fromTo(
          strokes,
          { strokeDasharray: (i: number) => lengths[i], strokeDashoffset: (i: number) => lengths[i] },
          { strokeDashoffset: 0, duration: 0.9, stagger: 0.02, ease: "power2.inOut", clearProps: "strokeDasharray,strokeDashoffset" },
          "<0.05",
        )
        .fromTo(q("[data-glow]"), { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1.15, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, "-=0.6");

      // Stage 3 — kinetic type.
      tl.fromTo(q("[data-letter]"), { yPercent: 110, autoAlpha: 0, rotateX: -70 }, { yPercent: 0, autoAlpha: 1, rotateX: 0, duration: 0.8, stagger: 0.04 }, "-=0.75").fromTo(
        q("[data-tagline]"),
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.5 },
        "-=0.45",
      );

      // Stage 4 — the glass card.
      tl.fromTo(q("[data-card]"), { autoAlpha: 0, y: 24, scale: 0.95 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "-=0.35");

      // Afterwards (outside the timeline, so it can complete): a slow ambient breathe on the backlight.
      tl.eventCallback("onComplete", () => {
        done();
        gsap.to(q("[data-backlight]"), { scale: 1.08, autoAlpha: 0.85, duration: 4, ease: "sine.inOut", yoyo: true, repeat: -1 });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} data-entrance="pending" className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-abyss px-4 py-10">
      {/* Stage 1 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Particles fade out around the logo and wordmark so they never cross the text. */}
        <div
          data-reveal
          data-backlight
          className="absolute left-1/2 top-[22%] size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,184,0,0.28)_0%,rgba(245,158,11,0.12)_32%,rgba(6,182,212,0.06)_55%,transparent_70%)] will-change-transform"
        />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_70%_55%_at_50%_24%,transparent_35%,black_75%)]">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            data-reveal
            data-particle
            className="absolute size-1 rounded-full bg-sun/80"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, boxShadow: "0 0 6px rgba(255,184,0,0.6)" }}
          />
        ))}
        </div>
      </div>

      {/* Stage 2 */}
      <div className="relative mb-4 flex justify-center">
        <span data-reveal data-glow aria-hidden className="absolute inset-0 -z-10 rounded-full bg-sun/30 blur-2xl" />
        <div data-reveal data-logo>
          <DiskarteLogo size={112} title="Diskarte" />
        </div>
      </div>

      {/* Stage 3 */}
      <p className="mb-1 flex select-none overflow-hidden font-pixel text-2xl tracking-[0.18em] text-sun [perspective:600px] sm:text-3xl">
        <span className="sr-only">Diskarte</span>
        {WORD.split("").map((ch, i) => (
          <span key={i} data-reveal data-letter aria-hidden className="inline-block will-change-transform">
            {ch}
          </span>
        ))}
      </p>
      <p data-reveal data-tagline className="mb-8 text-center font-silk text-[10px] uppercase tracking-widest text-slate-400">
        {tagline}
      </p>

      {/* Stage 4 */}
      <div data-reveal data-card className="relative w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
