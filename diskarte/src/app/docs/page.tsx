import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, Code2, LifeBuoy, Rocket, type LucideIcon } from "lucide-react";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { docSections, docsVersion, formatDocDate, getDoc } from "@/lib/docs/site";

export const metadata: Metadata = {
  title: { absolute: "Diskarte Help Center" },
  description: "Learn Diskarte: create a Tambayan, message friends, join calls, fix problems, or build and run the platform.",
  alternates: { canonical: "/docs" },
};

interface Group { title: string; blurb: string; Icon: LucideIcon; links: { href: string; label: string; hint: string }[] }

const GROUPS: Group[] = [
  {
    title: "Getting started", blurb: "New here? Set up in a few minutes.", Icon: Rocket,
    links: [
      { href: "/docs/getting-started/introduction", label: "What is Diskarte?", hint: "Tambayans, voice, the vocabulary" },
      { href: "/docs/getting-started/account-and-install#create-your-account", label: "Create an account", hint: "Sign up and set up your profile" },
      { href: "/docs/getting-started/account-and-install#install-diskarte-on-your-phone", label: "Install the app", hint: "iPhone, Android and computer" },
      { href: "/docs/guides/tambayans#create-a-tambayan", label: "Join or create a Tambayan", hint: "Templates, invites and channels" },
      { href: "/docs/guides/messages#send-a-message", label: "Send messages", hint: "Formatting, media and voice notes" },
      { href: "/docs/guides/calls#join-a-voice-channel", label: "Join a call", hint: "Voice channels and DM calls" },
    ],
  },
  {
    title: "User guides", blurb: "Everything Diskarte can do, step by step.", Icon: BookOpen,
    links: [
      { href: "/docs/guides/messages", label: "Messaging", hint: "Replies, threads, polls, scheduling" },
      { href: "/docs/guides/calls", label: "Voice and video", hint: "Screen share, mixer, activities" },
      { href: "/docs/guides/notifications-and-privacy#notifications", label: "Notifications", hint: "Alerts, quiet hours, push" },
      { href: "/docs/guides/events-and-moments#events", label: "Events", hint: "RSVPs, reminders, calendars" },
      { href: "/docs/guides/events-and-moments#moments", label: "Moments", hint: "24-hour updates for friends" },
      { href: "/docs/guides/workspace", label: "Shared workspace", hint: "Notes, boards, timers, whiteboard" },
      { href: "/docs/features/account-and-settings", label: "Profiles and settings", hint: "Appearance, privacy, data" },
    ],
  },
  {
    title: "Developers", blurb: "Run, understand and extend the platform.", Icon: Code2,
    links: [
      { href: "/docs/developers/local-setup", label: "Local setup", hint: "Supabase, LiveKit, first run" },
      { href: "/docs/developers/architecture", label: "Architecture", hint: "How the pieces fit together" },
      { href: "/docs/api", label: "API reference", hint: "Endpoints, webhooks, errors" },
      { href: "/docs/developers/database", label: "Database", hint: "Schema, RLS, permissions" },
      { href: "/docs/developers/realtime", label: "Realtime", hint: "Delivery, recovery, presence" },
      { href: "/docs/developers/contributing", label: "Contributing", hint: "Workflow and conventions" },
    ],
  },
  {
    title: "Help and troubleshooting", blurb: "Fix common problems fast.", Icon: LifeBuoy,
    links: [
      { href: "/docs/help/faq", label: "Common questions", hint: "Privacy, limits, data" },
      { href: "/docs/help/connection", label: "Connection problems", hint: "Messages, voice, weak signal" },
      { href: "/docs/help/notifications", label: "Notification issues", hint: "Permissions, iPhone, quiet hours" },
      { href: "/docs/help/sign-in", label: "Sign-in and recovery", hint: "Passwords, two-factor, sessions" },
      { href: "/docs/help/mobile-app", label: "Mobile app (PWA)", hint: "Install, update, offline" },
      { href: "/docs/help/report-a-problem", label: "Report a problem", hint: "Bugs, docs and security issues" },
    ],
  },
];

export default function DocsHome() {
  const changelog = getDoc("changelog");
  const latest = changelog?.headings.filter((h) => h.depth === 2).slice(0, 3) ?? [];
  return (
    <main id="docs-main" className="docs-home">
      <section className="docs-hero">
        <p className="docs-eyebrow">Diskarte Help Center</p>
        <h1>Tara, let’s figure it out.</h1>
        <p className="docs-hero-lede">Guides for everyday users, answers when something goes wrong, and the full technical documentation for people building and running Diskarte.</p>
        <DocsSearch categories={docSections.map((s) => s.title)} shortcut={false} label="Search guides, help and developer docs" className="docs-hero-search" />
        <p className="docs-version">
          Diskarte {docsVersion.app}
          {docsVersion.latestRelease && <> · latest release {formatDocDate(docsVersion.latestRelease)}</>} · docs reviewed {formatDocDate(docsVersion.reviewed)}
        </p>
      </section>

      <div className="docs-groups">
        {GROUPS.map(({ title, blurb, Icon, links }, i) => (
          <section key={title} className="docs-group" aria-labelledby={`docs-group-${i}`}>
            <div className="flex items-center gap-3">
              <span className="docs-group-icon"><Icon className="size-5" aria-hidden /></span>
              <div>
                <h2 id={`docs-group-${i}`}>{title}</h2>
                <p>{blurb}</p>
              </div>
            </div>
            <ul>
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>
                    <span>{link.label}</span>
                    <small>{link.hint}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="docs-whats-new" aria-labelledby="whats-new">
        <div>
          <h2 id="whats-new">What’s new</h2>
          <p>Recent releases from the changelog. See the <Link href="/docs/features">feature catalogue</Link> for what’s available and what needs setup.</p>
        </div>
        <ul>
          {latest.map((h) => (
            <li key={h.id}><Link href={`/docs/changelog#${h.id}`}>{h.text}</Link></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
