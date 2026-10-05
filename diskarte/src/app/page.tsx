import Link from "next/link";
import { Code2, Gamepad2, Headphones, MessagesSquare, MonitorUp, ShieldCheck, Users, Volume2 } from "lucide-react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { GithubMark } from "@/components/icons/BrandIcons";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { PixelStatus } from "@/components/retro/PixelStatus";
import { SignalBars } from "@/components/retro/SignalBars";
import { Glyph } from "@/components/ui/Glyph";
import { ScrollReveal } from "@/components/motion/ScrollReveal";
import { ScrollTilt } from "@/components/motion/ScrollTilt";
import { LandingHero } from "@/components/landing/LandingHero";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

const FEATURES = [
  { icon: MessagesSquare, title: "Real-time chat", body: "Instant messages with Markdown, code blocks, pins, edits and Pinoy reactions." },
  { icon: Headphones, title: "Lag-free voice", body: "LiveKit WebRTC rooms with noise suppression, active speaker glow at call HUD." },
  { icon: MonitorUp, title: "Screen share & video", body: "Share your ranked game or your thesis slides — an adaptive grid for the whole crew." },
  { icon: Users, title: "Community servers", body: "Invite codes, categorized channels, and Admin / Moderator / Member roles." },
  { icon: ShieldCheck, title: "Secure by default", body: "Row-Level Security on every table, CSP nonces, CSRF guards and rate limiting." },
  { icon: Code2, title: "Open-source forever", body: "Self-host on free tiers. Walang shutdown-shutdown — because it's ours." },
];

const PREVIEW_CHANNELS = ["general", "chika", "lfg-valorant"];

const PRIMARY_BUTTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-sun px-6 text-base font-bold text-abyss shadow-[0_4px_0_0_#b45309] transition-transform active:translate-y-[4px] active:shadow-none";

/** Signed-in visitors get "Open Diskarte" instead of a sign-in form (verified JWT claims, no round trip). */
async function isSignedIn() {
  if (!tryGetPublicEnv()) return false;
  try {
    const { data } = await (await createClient()).auth.getClaims();
    return typeof data?.claims?.sub === "string";
  } catch {
    return false;
  }
}

export default async function LandingPage() {
  const configured = Boolean(tryGetPublicEnv());
  const signedIn = await isSignedIn();

  return (
    <main className="diskarte-backdrop relative min-h-dvh overflow-hidden">
      <LandingHero
        header={
          <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
            <Link href="/" aria-label="Diskarte home" className="inline-flex items-center rounded-lg pointer-coarse:min-h-11">
              <DiskarteWordmark height={40} />
            </Link>
            <nav aria-label="Account" className="flex items-center gap-2">
              {signedIn ? (
                <Link href="/tambayan" className="rounded-lg bg-sun px-4 py-2 text-sm font-semibold text-abyss shadow-[0_3px_0_0_#b45309] transition-transform active:translate-y-[3px] active:shadow-none pointer-coarse:py-3">
                  Open app
                </Link>
              ) : (
                <>
                  <a href="#sign-in" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 pointer-coarse:py-3">
                    Log in
                  </a>
                  <Link
                    href="/signup"
                    className="rounded-lg bg-sun px-4 py-2 text-sm font-semibold text-abyss shadow-[0_3px_0_0_#b45309] transition-transform active:translate-y-[3px] active:shadow-none pointer-coarse:py-3"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </header>
        }
        card={signedIn ? <SignedInCard /> : configured ? <SignInCard /> : <ConfigNotice />}
      >
        <h1 className="text-balance text-3xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
          Walang <span className="whitespace-nowrap">Shutdown-Shutdown.</span>
          <span className="mt-1 block text-sun">Ang Bagong Istambayan ng Bayan.</span>
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base text-slate-300 sm:text-lg">
          Chat, voice, video and screen share for gamers, students and whole communities — open-source, free, and made in the Philippines.
        </p>
        <a
          href="https://github.com/xndrncp08/Diskorte"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
          rel="noopener noreferrer"
          target="_blank"
        >
          <GithubMark className="size-4" /> Source code on GitHub
        </a>
      </LandingHero>

      <div className="relative">
        <section aria-labelledby="preview-heading" className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-8">
          <h2 id="preview-heading" className="mb-3 text-center font-pixel text-sm leading-relaxed text-sun sm:text-base">
            PLAYER ONE HAS ENTERED
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-pretty text-center text-slate-300">
            Servers, channels, voice rooms and your whole barkada — on one glass dashboard that runs on prepaid data.
          </p>
          <ScrollTilt>
            <AppPreview />
          </ScrollTilt>
        </section>

        <ScrollReveal className="relative z-10 mx-auto max-w-6xl px-5 pb-24">
          <section aria-labelledby="features-heading">
            <h2 id="features-heading" className="mb-8 font-pixel text-sm leading-relaxed text-sun sm:text-base">
              LEVEL SELECT
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title} data-scroll-reveal className="glass rounded-2xl p-5 transition-colors hover:border-sun/30">
                  <Icon className="mb-3 size-6 text-sun" aria-hidden />
                  <h3 className="font-bold text-white">{title}</h3>
                  <p className="mt-1 text-sm text-slate-400">{body}</p>
                </li>
              ))}
            </ul>
          </section>
        </ScrollReveal>

        <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-slate-500">
          <p>
            Diskarte is open-source software. Gawa ng komunidad, para sa komunidad. <span className="font-silk tabular-nums">© {new Date().getFullYear()}</span>
          </p>
        </footer>
      </div>
    </main>
  );
}

function SignInCard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white">Press start</h2>
        <p className="mt-1 text-sm text-slate-400">Sign in to get back to your servers and friends.</p>
      </div>
      <LoginForm next="/tambayan" />
      <OAuthButtons providers={enabledOAuthProviders()} next="/tambayan" />
    </div>
  );
}

function SignedInCard() {
  return (
    <div className="space-y-5 text-center">
      <Gamepad2 className="mx-auto size-10 text-sun" aria-hidden />
      <div>
        <h2 className="text-2xl font-extrabold text-white">You&apos;re signed in</h2>
        <p className="mt-1 text-sm text-slate-400">Your servers, friends and calls are waiting.</p>
      </div>
      <Link href="/tambayan" className={`${PRIMARY_BUTTON} w-full`}>
        Open Diskarte
      </Link>
    </div>
  );
}

/** A miniature of the app shell (decorative). */
function AppPreview() {
  return (
    <div className="glass-strong relative overflow-hidden rounded-2xl shadow-2xl shadow-black/60" aria-hidden>
      <div className="flex h-72 sm:h-80">
        <div className="flex w-16 shrink-0 flex-col items-center gap-3 bg-abyss/80 py-4">
          <DiskarteLogo size={40} />
          <div className="h-0.5 w-8 rounded bg-white/10" />
          {["#FFB800", "#0038A8", "#CE1126"].map((c) => (
            <div key={c} className="size-10 rounded-2xl" style={{ background: c }} />
          ))}
        </div>
        <div className="hidden w-48 shrink-0 border-r border-white/5 bg-black/30 p-3 sm:block">
          <p className="mb-3 truncate text-sm font-bold text-white">Barkada HQ</p>
          <p className="mb-1 font-silk text-[10px] uppercase text-slate-500">Text Channels</p>
          {PREVIEW_CHANNELS.map((c, i) => (
            <p key={c} className={`rounded px-2 py-1 text-sm ${i === 0 ? "bg-white/10 text-white" : "text-slate-400"}`}>
              # {c}
            </p>
          ))}
          <p className="mb-1 mt-3 font-silk text-[10px] uppercase text-slate-500">Voice Channels</p>
          <p className="flex items-center gap-1.5 px-2 py-1 text-sm text-slate-400">
            <Volume2 className="size-4" aria-hidden /> Tambayan 1
          </p>
          <div className="ml-5 flex items-center gap-1.5 text-xs text-slate-300">
            <PixelStatus status="online" size={10} /> Juan
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-sun">
              Maria <span className="font-normal text-slate-500">ngayon</span>
            </p>
            <p className="text-sm text-slate-200">
              Tara ranked mamaya? <Glyph code=":game:" />
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-sky-300">
              Juan <span className="font-normal text-slate-500">ngayon</span>
            </p>
            <p className="text-sm text-slate-200">
              G! Nagluto lang ng Canton <Glyph code=":canton:" />
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 text-xs text-slate-500">
            Message #general <SignalBars level={4} />
          </div>
        </div>
      </div>
    </div>
  );
}
