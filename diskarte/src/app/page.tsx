import Link from "next/link";
import { Code2, Gamepad2, Headphones, MessagesSquare, MonitorUp, ShieldCheck, Sparkles, Users } from "lucide-react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { GithubMark } from "@/components/icons/BrandIcons";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { PixelStatus } from "@/components/retro/PixelStatus";
import { SignalBars } from "@/components/retro/SignalBars";

const FEATURES = [
  { icon: MessagesSquare, title: "Real-time chika", body: "Instant messages with Markdown, code blocks, pins, edits at Pinoy reactions." },
  { icon: Headphones, title: "Voice na walang lag", body: "LiveKit WebRTC rooms with noise suppression, active speaker glow at call HUD." },
  { icon: MonitorUp, title: "Screen share & video", body: "I-share ang ranked game mo o ang thesis slides — adaptive grid for the whole barkada." },
  { icon: Users, title: "Tambayan servers", body: "Invite codes, categorized channels, and Admin / Moderator / Member roles." },
  { icon: ShieldCheck, title: "Secure by default", body: "Row-Level Security sa bawat table, CSP nonces, CSRF guards at rate limiting." },
  { icon: Code2, title: "Open-source forever", body: "Self-host on free tiers. Walang shutdown-shutdown — kasi atin ito." },
];

const PREVIEW_CHANNELS = ["general", "chika", "lfg-valorant"];

export default function LandingPage() {
  return (
    <main className="diskarte-backdrop relative min-h-dvh overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" aria-label="Diskarte home" className="rounded-lg">
          <DiskarteWordmark height={40} />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 pointer-coarse:py-3">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-sun px-4 py-2 text-sm font-semibold text-abyss shadow-[0_3px_0_0_#b45309] transition-transform active:translate-y-[3px] active:shadow-none pointer-coarse:py-3"
          >
            Sali na!
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-sun/30 bg-sun/10 px-3 py-1 font-silk text-[11px] uppercase tracking-widest text-sun">
            <Sparkles className="size-3.5" aria-hidden /> Press start, kabayan
          </p>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Walang Shutdown-Shutdown.
            <span className="mt-2 block text-sun">Ang Bagong Istambayan ng Bayan.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg text-slate-300">
            Nag-shutdown man ang iba, may <strong className="text-white">diskarte</strong> tayo. Chat, voice, video at screen share para
            sa gamers, estudyante at buong komunidad — open-source, libre, at gawang Pinoy.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-sun px-6 text-base font-bold text-abyss shadow-[0_4px_0_0_#b45309] transition-transform active:translate-y-[4px] active:shadow-none"
            >
              <Gamepad2 className="size-5" aria-hidden /> Gumawa ng account
            </Link>
            <Link href="/login" className="glass inline-flex h-12 items-center rounded-xl px-6 text-base font-semibold text-white transition-colors hover:bg-white/10">
              May account na ako
            </Link>
            <a
              href="https://github.com/xndrncp08/Diskorte"
              className="inline-flex h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-300 transition-colors hover:text-white"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GithubMark className="size-4" /> Source code
            </a>
          </div>
        </div>

        {/* Mini app preview */}
        <div className="relative" aria-hidden>
          <div className="absolute -right-10 -top-16 opacity-90">
            <DiskarteLogo size={180} variant="mascot" />
          </div>
          <div className="glass-strong relative mt-16 overflow-hidden rounded-2xl shadow-2xl shadow-black/60">
            <div className="flex h-72">
              <div className="flex w-16 flex-col items-center gap-3 bg-abyss/80 py-4">
                <DiskarteLogo size={40} />
                <div className="h-0.5 w-8 rounded bg-white/10" />
                {["#FFB800", "#0038A8", "#CE1126"].map((c) => (
                  <div key={c} className="size-10 rounded-2xl" style={{ background: c }} />
                ))}
              </div>
              <div className="w-44 border-r border-white/5 bg-black/30 p-3">
                <p className="mb-3 truncate text-sm font-bold text-white">Barkada HQ</p>
                <p className="mb-1 font-silk text-[10px] uppercase text-slate-500">Text Channels</p>
                {PREVIEW_CHANNELS.map((c, i) => (
                  <p key={c} className={`rounded px-2 py-1 text-sm ${i === 0 ? "bg-white/10 text-white" : "text-slate-400"}`}>
                    # {c}
                  </p>
                ))}
                <p className="mb-1 mt-3 font-silk text-[10px] uppercase text-slate-500">Voice Channels</p>
                <p className="px-2 py-1 text-sm text-slate-400">🔊 Tambayan 1</p>
                <div className="ml-5 flex items-center gap-1.5 text-xs text-slate-300">
                  <PixelStatus status="online" size={10} /> Juan
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-end gap-3 p-4">
                <div>
                  <p className="text-xs font-semibold text-sun">
                    Maria <span className="font-normal text-slate-500">ngayon</span>
                  </p>
                  <p className="text-sm text-slate-200">Tara ranked mamaya? 🎮</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-sky-300">
                    Juan <span className="font-normal text-slate-500">ngayon</span>
                  </p>
                  <p className="text-sm text-slate-200">G! Nagluto lang ng Canton 🍜</p>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-black/40 px-3 py-2 text-xs text-slate-500">
                  Message #general <SignalBars level={4} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24">
        <h2 className="mb-8 font-pixel text-sm leading-relaxed text-sun sm:text-base">▶ LEVEL SELECT</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="glass rounded-2xl p-5 transition-colors hover:border-sun/30">
              <Icon className="mb-3 size-6 text-sun" aria-hidden />
              <h3 className="font-bold text-white">{title}</h3>
              <p className="mt-1 text-sm text-slate-400">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-xs text-slate-500">
        <p>
          Diskarte is open-source software. Gawa ng komunidad, para sa komunidad. <span className="font-silk">© {new Date().getFullYear()}</span>
        </p>
      </footer>
    </main>
  );
}
