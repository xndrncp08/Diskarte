"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Compass, Download, MessageSquare, Sparkles, UserPlus, Users, X } from "lucide-react";
import { useMe } from "@/components/providers/MeProvider";
import { usePwa } from "@/components/providers/PwaProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { HELP } from "@/lib/docs/help";
import { useLocale } from "@/lib/locale";
import { RELEASES, unseenReleases } from "@/lib/releases";
import type { Server } from "@/lib/servers";
import { HQ_CHANNELS, HQ_SERVER_ID } from "@/lib/admin";

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode: this session only */ } };

/**
 * First steps on Home, derived only from what the account already has (no tracking): a Tambayan
 * besides Diskarte HQ, a friend, a conversation, the installed app. Hides itself once everything is
 * done, or when dismissed (per account, this browser).
 */
export function GettingStarted({ servers, onCreate }: { servers: Server[]; onCreate: () => void }) {
  const { me } = useMe();
  const social = useOptionalSocial();
  const pwa = usePwa();
  const { t } = useLocale();
  const key = `diskarte:getting-started:${me.id}`;
  const [dismissed, setDismissed] = useState(true);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this browser's choice after hydration
  useEffect(() => setDismissed(read(key) === "dismissed"), [key]);

  const steps = [
    { done: servers.some((s) => !s.is_system), Icon: Users, title: t("Join or create a Tambayan"), text: t("Start your own with a template, or find one in Explore."), action: { label: t("Create"), onClick: onCreate }, link: { href: "/tambayan/explore", label: t("Explore") } },
    { done: (social?.friends ?? []).some((f) => f.status !== "incoming"), Icon: UserPlus, title: t("Add a friend"), text: t("Friends can message you and see your Moments."), link: { href: "/tambayan/friends", label: t("Add Friend") } },
    { done: (social?.conversations?.length ?? 0) > 0, Icon: MessageSquare, title: t("Say hello"), text: t("Send your first message in a DM or a channel."), link: { href: "/tambayan/messages", label: t("Messages") } },
    { done: pwa?.installed ?? false, Icon: Download, title: t("Install Diskarte"), text: t("Get it on your home screen, with notifications."), link: { href: HELP.install, label: t("How to install"), external: true } },
  ];
  const done = steps.filter((s) => s.done).length;
  if (dismissed || social?.conversations === null || done === steps.length) return null;

  return (
    <section aria-labelledby="getting-started-title" className="home-panel getting-started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="getting-started-title" className="flex items-center gap-2"><Compass className="size-4 text-sun" aria-hidden /> {t("Getting started")}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{t("A few steps to make Diskarte yours.")}</p>
        </div>
        <button type="button" onClick={() => { write(key, "dismissed"); setDismissed(true); }} aria-label={t("Hide getting started")} className="touch-target relative rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3" aria-hidden>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sun transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <span className="text-xs text-[var(--text-muted)]">{done}/{steps.length}</span>
      </div>
      <p className="sr-only">{done} / {steps.length} {t("steps done")}</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map(({ done: complete, Icon, title, text, action, link }) => (
          <li key={title} className="getting-started-step" data-done={complete || undefined}>
            <span className="getting-started-icon">{complete ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}</span>
            <span className="min-w-0 flex-1">
              <strong>{title}</strong>{complete && <span className="sr-only"> ({t("done")})</span>}
              <small>{text}</small>
              {!complete && (
                <span className="mt-1.5 flex flex-wrap gap-3 text-xs font-semibold">
                  {action && <button type="button" onClick={action.onClick} className="text-[var(--text-accent)] hover:underline">{action.label}</button>}
                  {"external" in link ? <a href={link.href} target="_blank" rel="noopener" className="text-[var(--text-accent)] hover:underline">{link.label}</a> : <Link href={link.href} className="text-[var(--text-accent)] hover:underline">{link.label}</Link>}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The newest release notes this browser hasn't acknowledged. First visits just record the current release. */
export function WhatsNew() {
  const { t } = useLocale();
  const latest = RELEASES[0];
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const seen = read("diskarte:last-release");
    if (!seen && latest) write("diskarte:last-release", latest.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this browser's state after hydration
    setLastSeen(seen ?? latest?.id ?? null);
  }, [latest]);
  const unseen = lastSeen === undefined ? [] : unseenReleases(lastSeen);
  const release = unseen[0];
  if (!release) return null;
  const dismiss = () => { write("diskarte:last-release", latest.id); setLastSeen(latest.id); };
  return (
    <section aria-labelledby="whats-new-title" className="home-panel whats-new">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-kicker flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden /> {t("What's new")}{unseen.length > 1 && ` · ${unseen.length} ${t("updates")}`}</p>
          <h3 id="whats-new-title">{release.title}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{release.summary}</p>
        </div>
        <button type="button" onClick={dismiss} aria-label={t("Mark updates as read")} className="touch-target relative shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
        {release.highlights.slice(0, 3).map((h) => <li key={h.title}><strong className="text-[var(--text-primary)]">{h.title}</strong> — {h.text}</li>)}
      </ul>
      <p className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href={`/tambayan/${HQ_SERVER_ID}/${HQ_CHANNELS.announcements}`} onClick={dismiss} className="text-[var(--text-accent)] hover:underline">{t("Read the full update")}</Link>
        <a href="/docs/changelog" target="_blank" rel="noopener" className="text-[var(--text-accent)] hover:underline">{t("All updates")}</a>
      </p>
    </section>
  );
}
