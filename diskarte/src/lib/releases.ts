import releases from "@/content/releases.json";
export { UPDATES_NAME } from "@/lib/admin";

/**
 * Developer-written, user-facing release notes (src/content/releases.json, newest first). They feed
 * the official "Diskarte Updates" post in Diskarte HQ #announcements (see lib/releases-server.ts)
 * and the What's New card on Home. Formatting is deterministic: no generated text.
 */
export interface Release {
  /** `YYYY-MM-DD-short-name`, unique; the date is the release date. */
  id: string;
  date: string;
  title: string;
  summary: string;
  highlights: { title: string; text: string; href?: string }[];
  fixes: string[];
  links: { label: string; href: string }[];
  /**
   * Database columns (`table.column`) the release's features need. Production waits to announce
   * until they exist, so a post never promises features whose migrations haven't been applied.
   */
  requires?: string[];
}

export const RELEASES = releases as Release[];

const absolute = (href: string, siteUrl: string) => (/^https?:\/\//.test(href) ? href : `${siteUrl.replace(/\/$/, "")}${href}`);

/** The Markdown posted to #announcements (chat Markdown: headings, callouts, lists, https links). */
export function formatReleasePost(release: Release, siteUrl: string): string {
  const date = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${release.date}T00:00:00Z`));
  const lines = [`## ${release.title}`, `*${date}*`, "", `> [!INFO]`, `> ${release.summary}`, ""];
  if (release.highlights.length) {
    lines.push("### What's new");
    for (const h of release.highlights) lines.push(`- **${h.title}** — ${h.text}${h.href ? ` [Learn more](${absolute(h.href, siteUrl)})` : ""}`);
    lines.push("");
  }
  if (release.fixes.length) {
    lines.push("### Fixed");
    for (const fix of release.fixes) lines.push(`- ${fix}`);
    lines.push("");
  }
  if (release.links.length) lines.push(release.links.map((l) => `[${l.label}](${absolute(l.href, siteUrl)})`).join(" · "));
  return lines.join("\n").trim();
}

/** Releases newer than the one this browser last acknowledged (all of them = only the newest). */
export function unseenReleases(lastSeen: string | null, list: Release[] = RELEASES): Release[] {
  if (!lastSeen) return list.slice(0, 1);
  const i = list.findIndex((r) => r.id === lastSeen);
  return i < 0 ? list.slice(0, 1) : list.slice(0, i);
}
