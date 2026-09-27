import { headers } from "next/headers";
import { ApplicationForm } from "@/components/ApplicationForm";
import { Mascot, Wordmark } from "@/components/Brand";
import { issueFormToken } from "@/lib/antispam";
import { getPortalEnv } from "@/lib/env";

const PERKS = [
  { emoji: "🎙️", title: "Voice, video at screen share", body: "LiveKit-powered calls na hindi nagla-lag kahit naka-data." },
  { emoji: "📡", title: "LFG Board", body: "1-click Join Party diretso sa voice channel." },
  { emoji: "🛡️", title: "Bantay-Bayan", body: "Auto-mod laban sa scam links, spam at toxic." },
  { emoji: "📶", title: "Low-data mode", body: "Para sa prepaid data at mahinang signal." },
];

const STEPS = ["Mag-apply dito", "I-review ng team", "Login details sa email", "Tambay na!"];

export default async function EarlyAccessPage() {
  const env = getPortalEnv();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main className="diskarte-backdrop relative min-h-dvh overflow-x-hidden">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-16">
        <section className="flex flex-col justify-center" aria-labelledby="hero-title">
          <Wordmark height={48} className="self-start" />
          <p className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-sun/40 bg-sun/10 px-3 py-1 font-pixel text-[9px] leading-relaxed text-sun">
            <span className="size-1.5 animate-blink rounded-full bg-sun" aria-hidden /> EARLY ACCESS · BATCH 01
          </p>
          <h1 id="hero-title" className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Mauna sa bagong <span className="text-sun">istambayan</span> ng bayan.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300">
            Ang Diskarte ay open-source na Discord alternative para sa Pinoy gamers, estudyante at creators. Limitado ang slots sa unang batch — mag-apply na
            at kami na ang bahala sa login mo.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {PERKS.map((p) => (
              <li key={p.title} className="glass flex gap-3 rounded-2xl p-3.5">
                <span className="text-2xl" aria-hidden>
                  {p.emoji}
                </span>
                <span>
                  <span className="block font-semibold text-white">{p.title}</span>
                  <span className="block text-sm text-slate-400">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <ol className="mt-8 flex flex-wrap items-center gap-2 text-sm text-slate-300" aria-label="Paano ito gumagana">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-white/10 font-pixel text-[9px] text-sun">{i + 1}</span>
                {step}
                {i < STEPS.length - 1 && (
                  <span className="text-slate-600" aria-hidden>
                    ▸
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="apply-title" className="relative">
          <Mascot size={112} className="absolute -right-5 -top-16 z-20 hidden animate-float drop-shadow-[0_12px_30px_rgba(255,184,0,0.35)] sm:block" />
          <div className="glass-strong relative rounded-3xl p-6 shadow-2xl shadow-black/50 sm:p-8">
            <h2 id="apply-title" className="text-2xl font-extrabold text-white sm:pr-20">
              Mag-apply para sa Early Access
            </h2>
            <p className="mb-6 mt-1 text-sm text-slate-400">2 minuto lang. Walang bayad, walang credit card.</p>
            <ApplicationForm formToken={issueFormToken(env.secret)} turnstileSiteKey={env.turnstile?.siteKey ?? null} nonce={nonce} />
          </div>
          <p className="mt-4 text-center text-xs text-slate-500">
            May account ka na?{" "}
            <a href={`${env.appUrl}/login`} className="text-sky-300 underline-offset-2 hover:underline">
              Mag-login sa Diskarte
            </a>
          </p>
        </section>
      </div>
      <footer className="relative z-10 border-t border-white/5 py-6 text-center text-xs text-slate-500">
        Diskarte · Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan. ·{" "}
        <a href="/admin" className="text-slate-400 hover:text-white">
          Admin
        </a>
      </footer>
    </main>
  );
}
