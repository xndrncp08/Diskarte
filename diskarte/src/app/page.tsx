import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Compass,
  Gamepad2,
  Headphones,
  Layers3,
  MessageSquare,
  MonitorUp,
  Palette,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { GithubMark } from "@/components/icons/BrandIcons";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingMotion } from "@/components/landing/LandingMotion";
import {
  ProductPlayground,
  WorkspaceCloseup,
} from "@/components/landing/ProductPlayground";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { ConfigNotice } from "@/components/ConfigNotice";
import { tryGetPublicEnv } from "@/lib/env";
import { enabledOAuthProviders } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import "@/components/auth/auth.css";
import "@/components/landing/landing.css";

const CAPABILITIES = [
  {
    Icon: MessageSquare,
    title: "Conversations with context",
    body: "Channels, threads, reactions, pins and search. Give every conversation its own place.",
    detail: "MESSAGES / THREADS / MEDIA",
    className: "feature-conversations",
  },
  {
    Icon: Headphones,
    title: "Less typing. More tambay.",
    body: "Voice, video and screen sharing. Drop into a room and bring your whole day with you.",
    detail: "VOICE / VIDEO / SCREEN SHARE",
    className: "feature-voice",
  },
  {
    Icon: CalendarDays,
    title: "Make a plan. Show up.",
    body: "Community events, RSVPs and calendar downloads. Keep the next hangout in reach.",
    detail: "EVENTS / COMMUNITY",
    className: "feature-events",
  },
  {
    Icon: Compass,
    title: "Find your kind of people.",
    body: "Browse communities that chose to be listed, or build a private tambayan with an invite.",
    detail: "DISCOVERY / INVITES / ROLES",
    className: "feature-discovery",
  },
];

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
  const signedIn = await isSignedIn();
  const start = signedIn ? "/tambayan" : "/signup";
  return (
    <main className="launch-page diskarte-backdrop min-h-dvh">
      <LandingMotion>
        <LandingHero
          header={
            <header className="launch-header launch-container">
              <Link
                href="/"
                aria-label="Diskarte home"
                className="launch-wordmark"
              >
                <DiskarteWordmark
                  height={40}
                  className="public-wordmark h-9 w-auto"
                />
              </Link>
              <nav
                aria-label="Features and story"
                className="launch-desktop-nav"
              >
                <a href="#features">Features</a>
                <a href="#workspace">Workspace</a>
                <a href="#story">Our story</a>
              </nav>
              <nav aria-label="Account" className="launch-account-nav">
                <a href="#sign-in">Log in</a>
                <Link href={start} className="launch-small-cta">
                  {signedIn ? "Open app" : "Sign up"}
                  <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </nav>
              <details className="launch-mobile-menu">
                <summary aria-label="Explore this page">
                  <Layers3 className="size-5" aria-hidden />
                </summary>
                <nav aria-label="Explore this page">
                  <a href="#features">Features</a>
                  <a href="#workspace">Workspace</a>
                  <a href="#story">Our story</a>
                </nav>
              </details>
            </header>
          }
          card={<ProductPlayground />}
        >
          <h1>
            Tara, <span>Tambay Tayo.</span>{" "}
            <span className="hero-subheadline">
              Ang Bagong <br />
              Istambayan ng Bayan.
            </span>
          </h1>
          <p className="hero-support">
            Big ideas. Late-night kwento. One more game.
            <br className="hidden sm:block" /> Your conversations, calls and
            shared projects belong together.
          </p>
          <div className="launch-cta-row">
            <Link href={start} className="launch-primary">
              {signedIn ? "Open Diskarte" : "Get started"}
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
            <a href="#features" className="launch-secondary">
              Explore features
              <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>
          <div className="hero-capability-tags">
            <span>
              <MessageSquare /> Chat
            </span>
            <span>
              <Headphones /> Voice & video
            </span>
            <span>
              <Layers3 /> Shared spaces
            </span>
          </div>
          <p className="hero-brand-note">
            A Filipino-inspired, open-source space for connection.
            <br />
            Free to use. Yours to make something of.
          </p>
        </LandingHero>
        <section
          className="launch-ribbon"
          aria-label="A place for every kind of community"
        >
          <div className="launch-container">
            <span>MAKE ROOM FOR</span>
            <span>YOUR BARKADA</span>
            <span>THE GUILD</span>
            <span>THE GROUP PROJECT</span>
            <span>THE NEXT BIG IDEA</span>
          </div>
        </section>
        <section
          id="features"
          className="launch-container launch-section"
          aria-labelledby="features-heading"
          data-reveal
        >
          <div className="launch-section-heading">
            <div>
              <p className="section-kicker">01 / A LITTLE MORE CONNECTED</p>
              <h2 id="features-heading">
                Everything happens
                <br />
                <span>in your tambayan.</span>
              </h2>
            </div>
            <p>
              Stay for the conversation.
              <br />
              Make room for everything around it.
            </p>
          </div>
          <div className="launch-feature-grid">
            {CAPABILITIES.map(
              ({ Icon, title, body, detail, className }, index) => (
                <article key={title} className={`launch-feature ${className}`}>
                  <div className="feature-topline">
                    <span className="feature-number">0{index + 1}</span>
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  {index === 0 ? (
                    <div className="feature-message-stack" aria-hidden>
                      <span>
                        <HashMark /> chika{" "}
                        <small>Keep the good conversations going.</small>
                      </span>
                      <span>
                        <HashMark /> ideas{" "}
                        <small>A thread for the next big thing.</small>
                      </span>
                      <span>
                        <HashMark /> the-weekend{" "}
                        <small>Make a plan with your people.</small>
                      </span>
                    </div>
                  ) : index === 1 ? (
                    <div className="feature-audio" aria-hidden>
                      {[
                        18, 35, 26, 50, 34, 62, 45, 28, 53, 36, 24, 42, 19, 31,
                      ].map((height, i) => (
                        <i key={i} style={{ height }} />
                      ))}
                    </div>
                  ) : index === 2 ? (
                    <div className="feature-event" aria-hidden>
                      <span>
                        YOUR NEXT
                        <br />
                        <strong>HANGOUT</strong>
                      </span>
                      <CalendarDays className="size-8" />
                    </div>
                  ) : (
                    <div className="feature-community" aria-hidden>
                      <span>PLAY</span>
                      <span>CREATE</span>
                      <span>LEARN</span>
                      <span>BELONG</span>
                    </div>
                  )}
                  <span className="feature-detail">{detail}</span>
                </article>
              ),
            )}
          </div>
        </section>
        <section
          id="workspace"
          className="launch-container launch-section workspace-story"
          aria-labelledby="workspace-heading"
          data-reveal
        >
          <div className="launch-section-heading">
            <div>
              <p className="section-kicker">02 / KEEP YOUR IDEAS CLOSE</p>
              <h2 id="workspace-heading">
                More than a chat.
                <br />
                <span>A place to make things.</span>
              </h2>
            </div>
            <p>
              Arrange your desktop your way.
              <br />
              Keep it focused on your phone.
            </p>
          </div>
          <WorkspaceCloseup />
          <div className="workspace-footnotes">
            <span>
              <Layers3 /> Floating desktop panels
            </span>
            <span>
              <MonitorUp /> Notes, boards & whiteboards
            </span>
            <span>
              <Smartphone /> Full-screen mobile spaces
            </span>
          </div>
        </section>
        <section
          id="story"
          className="launch-story"
          aria-labelledby="story-heading"
          data-reveal
        >
          <div className="launch-container story-grid">
            <div>
              <p className="section-kicker">03 / THE WAY WE FIGURE IT OUT</p>
              <h2 id="story-heading">
                May paraan.
                <br />
                <span>May Diskarte.</span>
              </h2>
              <p className="story-pronunciation">
                dis·kar·te / ingenuity, resourcefulness, a way forward
              </p>
            </div>
            <div className="story-copy">
              <p>
                Diskarte is what happens when an idea meets a little
                resourcefulness. You find a way. You bring people together. You
                make something out of what you have.
              </p>
              <p>
                We built a space around that spirit: a tambayan for the friends
                you play with, the people you learn from, and the projects you
                haven&apos;t quite figured out yet.
              </p>
              <p>Less getting in the way. More room for your people.</p>
              <Link href={start} className="launch-text-link">
                Find your place <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="launch-container launch-section launch-details"
          aria-label="Make Diskarte yours"
          data-reveal
        >
          <article>
            <Palette className="size-5" aria-hidden />
            <h3>Your own kind of space.</h3>
            <p>
              Themes, profiles, statuses and a workspace you can arrange around
              the way you hang out.
            </p>
          </article>
          <article>
            <Smartphone className="size-5" aria-hidden />
            <h3>Same people. Any screen.</h3>
            <p>
              Use your browser or install Diskarte as a PWA. Your desktop and
              phone keep you connected.
            </p>
          </article>
          <article>
            <ShieldCheck className="size-5" aria-hidden />
            <h3>A little peace of mind.</h3>
            <p>
              Private channels, community roles, moderation tools and account
              security that stays in your hands.
            </p>
          </article>
          <article>
            <GithubMark className="size-5" />
            <h3>Open, by design.</h3>
            <p>
              Explore the source, self-host, and see what makes Diskarte tick.
            </p>
            <a
              href="https://github.com/xndrncp08/Diskarte"
              target="_blank"
              rel="noopener noreferrer"
              className="launch-text-link"
            >
              Source code on GitHub{" "}
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </article>
        </section>
        <section
          id="sign-in"
          className="launch-container launch-section launch-closing"
          aria-labelledby="closing-heading"
          data-reveal
        >
          <div>
            <p className="section-kicker">YOUR NEXT CONVERSATION STARTS HERE</p>
            <h2 id="closing-heading">
              Bring your people.
              <br />
              <span>We&apos;ll make room.</span>
            </h2>
            <p>
              Chat, call, collaborate, or just tambay.
              <br />A space that feels a little more like yours.
            </p>
            <div className="launch-cta-row">
              <Link href={start} className="launch-primary">
                {signedIn ? "Open Diskarte" : "Get started"}
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
              <a href="#features" className="launch-secondary">
                Take another look
              </a>
            </div>
            <div className="closing-icons" aria-hidden>
              <Gamepad2 />
              <Users />
              <Headphones />
              <Layers3 />
            </div>
          </div>
          <div className="auth-surface launch-signin">
            {signedIn ? (
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-white">
                  You&apos;re signed in
                </h3>
                <p className="text-sm text-slate-400">
                  Your servers, friends and calls are waiting.
                </p>
                <Link href="/tambayan" className="launch-primary">
                  Open Diskarte <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : tryGetPublicEnv() ? (
              <>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  Welcome back.
                </h3>
                <p className="mb-6 text-sm text-slate-400">
                  Pick up where your barkada left off.
                </p>
                <LoginForm next="/tambayan" />
                <div className="mt-5">
                  <OAuthButtons
                    providers={enabledOAuthProviders()}
                    next="/tambayan"
                  />
                </div>
              </>
            ) : (
              <ConfigNotice />
            )}
          </div>
        </section>
        <footer className="launch-footer launch-container">
          <Link href="/" aria-label="Diskarte home">
            <DiskarteWordmark height={34} className="public-wordmark" />
          </Link>
          <p>Gawa ng komunidad, para sa komunidad.</p>
          <nav aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#story">Our story</a>
            <a
              href="https://github.com/xndrncp08/Diskarte"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
          <small>© {new Date().getFullYear()} Diskarte</small>
        </footer>
      </LandingMotion>
    </main>
  );
}

function HashMark() {
  return <span className="text-sun">#</span>;
}
