"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountBadge } from "./Chip";
import { LiveIndicator } from "./PulseLine";

export interface NavItemProps {
  label: string;
  /** Second line under the label (topic, last message, "3 in voice"). */
  secondary?: ReactNode;
  /** Decorative leading Monogram, Avatar or icon (hidden from screen readers: put a status in `secondary` or the label). */
  leading?: ReactNode;
  /** A link when set (next/link), otherwise a button calling `onClick`. */
  href?: string;
  onClick?: () => void;
  /** The page being shown: aria-current="page", tinted row, bold label with a sun underline. */
  current?: boolean;
  /** Unread activity: a dot and a bold label, and ", unread" for screen readers. Ignored when `count` shows. */
  unread?: boolean;
  /** Count badge (mentions, requests); `countLabel` completes its spoken text ("2 mentions"). */
  count?: number;
  countLabel?: string;
  countTone?: "neutral" | "alert" | "accent";
  /** Something live here: true shows "Live", a string names it ("3 in voice"). */
  live?: boolean | string;
  /** Muted or archived: the label turns muted unless it is current. */
  dimmed?: boolean;
  className?: string;
}

/**
 * A row in a navigator list (Spaces, rooms, DMs). At least 44 px tall, item radius, hover tint, the global focus outline.
 * Current is marked by shape as well as tint (a sun underline under a bold label), never a side pill.
 * Unread is a dot plus bold text plus sr-only words; counts go through CountBadge so they are never a bare number.
 */
export function NavItem({ label, secondary, leading, href, onClick, current = false, unread = false, count = 0, countLabel = "unread", countTone = "alert", live, dimmed = false, className }: NavItemProps) {
  const showDot = unread && count <= 0;
  const body = (
    <>
      {leading && (
        <span className="inline-flex shrink-0 items-center text-pulse-muted [&>svg]:size-5" aria-hidden>
          {leading}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-pulse-body",
            current || unread ? "font-semibold text-pulse-text" : dimmed ? "text-pulse-muted" : "text-pulse-text",
            current && "underline decoration-pulse-accent-mark decoration-2 underline-offset-4",
          )}
        >
          {label}
          {showDot && <span className="sr-only">, unread</span>}
        </span>
        {secondary && <span className="block truncate text-pulse-caption text-pulse-muted">{secondary}</span>}
      </span>
      {live && <LiveIndicator label={typeof live === "string" ? live : "Live"} hideLabel={typeof live !== "string"} className="shrink-0" />}
      <CountBadge count={count} label={countLabel} tone={countTone} className="shrink-0" />
      {showDot && <span className="size-2 shrink-0 rounded-full bg-pulse-accent-mark" aria-hidden data-unread />}
    </>
  );
  const shell = cn(
    "flex min-h-11 w-full items-center gap-3 rounded-pulse-item px-3 py-1.5 text-left font-pulse-text transition-colors duration-(--pulse-dur-press)",
    current ? "bg-pulse-selected" : "hover:bg-pulse-hover active:bg-pulse-pressed",
    className,
  );
  return href ? (
    <Link href={href} aria-current={current ? "page" : undefined} className={shell}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-current={current ? "page" : undefined} className={shell}>
      {body}
    </button>
  );
}

export interface BottomTab {
  href: string;
  label: string;
  /** Decorative icon (the label names the link). */
  icon: ReactNode;
  current?: boolean;
  count?: number;
  /** Completes the badge's spoken text ("3 unread messages"). */
  countLabel?: string;
}

/**
 * Phone bottom navigation: a labelled <nav> of links (not ARIA tabs: each one changes the page). Each link is
 * icon over label, at least 44 px wide and 56 px tall; the current one has aria-current="page", bold text and a
 * sun bar above its icon. Counts are CountBadges on the icon. Pads for the home indicator (safe-area inset).
 * Position it yourself (fixed or the last row of the shell).
 */
export function BottomTabBar({ label, items, className }: { label: string; items: BottomTab[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("border-t border-pulse-line bg-pulse-surface pb-[env(safe-area-inset-bottom)] font-pulse-text", className)}>
      <ul className="flex">
        {items.map((t) => (
          <li key={t.href} className="min-w-11 flex-1">
            <Link
              href={t.href}
              aria-current={t.current ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-pulse-caption transition-colors",
                "before:absolute before:top-0 before:h-[3px] before:w-8 before:rounded-b-full",
                t.current ? "font-semibold text-pulse-text before:bg-pulse-accent-mark" : "text-pulse-muted hover:text-pulse-text",
              )}
            >
              <span className="relative inline-flex [&_svg]:size-6">
                <span className="inline-flex" aria-hidden>
                  {t.icon}
                </span>
                <CountBadge count={t.count ?? 0} label={t.countLabel ?? "unread"} tone="alert" className="absolute -right-3 -top-1.5" />
              </span>
              <span className="max-w-full truncate">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
