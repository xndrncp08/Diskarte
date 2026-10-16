import Link from "next/link";
import { ArrowLeft, Headphones, MessagesSquare, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import "./auth.css";

/** Shared presentation only: session checks and redirects stay in each route. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout diskarte-backdrop">
      <header className="auth-header">
        <Link href="/" aria-label="Diskarte home" className="inline-flex min-h-11 items-center rounded-lg">
          <DiskarteWordmark height={38} className="public-wordmark h-9 w-auto" />
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-slate-300 hover:text-sun">
          <ArrowLeft className="size-4" aria-hidden /> Back to home
        </Link>
      </header>
      <div className="auth-grid">
        <aside className="auth-story" aria-label="Welcome to Diskarte">
          <div className="auth-story-mark" aria-hidden><DiskarteLogo variant="mascot" size="100%" /></div>
          <p className="auth-eyebrow">MADE FOR YOUR BARKADA</p>
          <h2>Your people.<br />Your place.<br /><span className="text-sun">Your Diskarte.</span></h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-slate-300">From one more game to one more kwento. A little closer, wherever life takes you.</p>
          <div className="auth-story-features">
            <span><MessagesSquare aria-hidden /> Real-time chat</span>
            <span><Headphones aria-hidden /> Voice & video</span>
          </div>
          <p className="mt-10 text-xs text-slate-400">Gawa ng komunidad, para sa komunidad.</p>
        </aside>
        <section className="auth-form-column" aria-label="Your account">
          <div className="auth-surface auth-panel">{children}</div>
          <p className="auth-reassurance"><ShieldCheck className="size-4 shrink-0" aria-hidden /> Your space. Your conversations. Your community.</p>
        </section>
      </div>
    </main>
  );
}
