import type { ReactNode } from "react";
import { GLASS_CARD, SplitWordmark } from "@/components/brand/BrandStage";
import { cn } from "@/lib/utils";
import { HeroLogo } from "./HeroLogo";
import "@/components/auth/auth.css";

/**
 * Landing hero: the mascot over an ambient glow, the split "DISKARTE" word, the headline, and the
 * glass auth card beside it (below it on phones). Plain HTML and CSS, visible from the first paint.
 */
export function LandingHero({ header, card, children }: { header: ReactNode; card: ReactNode; children: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden">
      <AmbientGlow className="top-[30%] lg:left-[32%]" />
      {header}

      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-2 lg:min-h-[calc(100svh-5rem)] lg:grid-cols-[1fr_26rem] lg:gap-14 lg:pb-16">
        <div className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
          <p className="auth-eyebrow mb-3 mt-6">YOUR PEOPLE. YOUR PLACE.</p>
          <HeroLogo />
          <SplitWordmark className="mb-6 text-4xl sm:text-5xl lg:justify-start" />
          {children}
        </div>

        <div id="sign-in" className="w-full max-w-md scroll-mt-6 justify-self-center lg:justify-self-end">
          <div className={cn(GLASS_CARD, "auth-surface p-6 sm:p-8")}>{card}</div>
        </div>
      </section>
    </div>
  );
}

/** Midnight base with a warm radial glow: the backdrop behind the landing and auth pages. Decorative. */
export function AmbientGlow({ className }: { className?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-abyss">
      <div
        className={cn(
          "absolute left-1/2 top-[30%] size-[64rem] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_184_0/0.2)_0%,rgb(245_158_11/0.08)_30%,rgb(6_182_212/0.05)_52%,transparent_70%)]",
          className,
        )}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(ellipse_80%_60%_at_50%_100%,rgb(6_182_212/0.08),transparent_70%)]" />
    </div>
  );
}
