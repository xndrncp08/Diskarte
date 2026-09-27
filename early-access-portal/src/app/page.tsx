import { headers } from "next/headers";
import { ApplicationForm } from "@/components/ApplicationForm";
import { Mascot } from "@/components/Brand";
import { Hero } from "@/components/landing/Hero";
import { MeshBackground } from "@/components/landing/MeshBackground";
import { Faq, Features, FinalCta, HowItWorks } from "@/components/landing/Sections";
import { TopBar } from "@/components/landing/TopBar";
import { issueFormToken } from "@/lib/antispam";
import { getPortalEnv } from "@/lib/env";

export default async function EarlyAccessPage() {
  const env = getPortalEnv();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="diskarte-backdrop relative min-h-dvh overflow-x-hidden">
      <MeshBackground />
      <TopBar appUrl={env.appUrl} />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-14 2xl:max-w-7xl">
        <section aria-labelledby="hero-title">
          <Hero />
        </section>

        <section id="apply" aria-labelledby="apply-title" className="relative scroll-mt-6">
          <Mascot size={96} className="absolute -right-3 -top-12 z-20 animate-float drop-shadow-[0_12px_30px_rgba(255,184,0,0.35)] lg:hidden" />
          <div className="glass-strong relative rounded-3xl p-5 shadow-2xl shadow-black/50 sm:p-8">
            <h2 id="apply-title" className="pr-16 text-2xl font-extrabold text-white lg:pr-0">
              Mag-apply para sa Early Access
            </h2>
            <p className="mb-6 mt-1 text-sm text-slate-400">2 minuto lang. Walang bayad, walang credit card.</p>
            <ApplicationForm formToken={issueFormToken(env.secret)} turnstileSiteKey={env.turnstile?.siteKey ?? null} nonce={nonce} />
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            May account ka na?{" "}
            <a href={`${env.appUrl}/login?from=early-access`} className="inline-flex min-h-11 items-center text-sky-300 underline-offset-2 hover:underline">
              Mag-login sa Diskarte
            </a>
          </p>
        </section>
      </div>

      <div className="relative z-10">
        <HowItWorks />
        <Features />
        <Faq />
        <FinalCta />
      </div>

      <footer className="relative z-10 border-t border-white/5 px-4 py-6 text-center text-xs text-slate-500">
        Diskarte · Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan. ·{" "}
        <a href="/admin" className="inline-flex min-h-11 items-center text-slate-400 hover:text-white">
          Admin
        </a>
      </footer>
    </main>
  );
}
