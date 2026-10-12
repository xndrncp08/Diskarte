import Link from "next/link";
import { GLASS_CARD, SplitWordmark } from "@/components/brand/BrandStage";
import { AmbientGlow, Mascot } from "@/components/landing/LandingHero";
import { cn } from "@/lib/utils";

/** The sign-in / sign-up / password pages: the mascot, "DISKARTE" in split type, then the glass card with the form. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main>
      <div className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8 sm:py-10">
        <AmbientGlow className="top-[18%]" />
        <Mascot className="size-36 sm:size-44" />
        <SplitWordmark className="mt-1 text-3xl sm:text-4xl" />
        <p className="mb-7 mt-3 text-center font-silk text-[10px] uppercase tracking-widest text-slate-400">Tara, tambay tayo</p>

        <div className="relative w-full max-w-md">
          <div className={cn(GLASS_CARD, "p-6 sm:p-8")}>{children}</div>
          <p className="mt-6 text-center text-xs text-slate-500">
            <Link href="/" className="inline-flex items-center rounded-md px-2 text-slate-400 hover:text-sun pointer-coarse:min-h-11" aria-label="Diskarte home">
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
