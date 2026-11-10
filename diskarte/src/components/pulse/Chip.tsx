"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "live" | "alert" | "people";

// Tinted surfaces keep --pulse-text (contrast-tested over every tint); the tone colours only the leading mark.
const TINT: Record<Tone, string> = {
  neutral: "bg-pulse-raised",
  accent: "bg-pulse-selected",
  live: "bg-pulse-live-tint",
  alert: "bg-pulse-mention",
  people: "bg-pulse-people-tint",
};
const MARK: Record<Tone, string> = {
  neutral: "bg-pulse-faint",
  accent: "bg-pulse-accent-mark",
  live: "bg-pulse-live",
  alert: "bg-pulse-alert",
  people: "bg-pulse-people",
};

/**
 * Tag chip (a topic, a role, a filter). Static by default; with `onClick` it is a toggle button
 * (`selected` → aria-pressed and a selected tint); with `onRemove` it gets a remove button named
 * "Remove {children}" (pass `removeLabel` when children isn't plain text). Rows of chips wrap; 44 px tall on touch.
 */
export function Chip({
  children,
  tone = "neutral",
  selected,
  onClick,
  onRemove,
  removeLabel,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  const body = (
    <>
      {tone !== "neutral" && <span className={cn("size-1.5 shrink-0 rounded-full", MARK[tone])} aria-hidden />}
      <span className="truncate">{children}</span>
    </>
  );
  const shell = cn(
    "inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-pulse-control border border-transparent font-pulse-text text-pulse-label font-medium text-pulse-text pointer-coarse:min-h-11",
    selected ? "border-pulse-accent-mark bg-pulse-selected" : TINT[tone],
    className,
  );
  if (onClick)
    return (
      <button type="button" aria-pressed={selected ?? false} onClick={onClick} className={cn(shell, "px-3 transition-colors hover:border-pulse-line-strong")}>
        {body}
      </button>
    );
  return (
    <span className={cn(shell, "pl-3", onRemove ? "pr-0.5" : "pr-3")}>
      {body}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${typeof children === "string" ? children : "tag"}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-pulse-control text-pulse-muted transition-colors hover:bg-pulse-hover hover:text-pulse-text pointer-coarse:size-11"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

const COUNT_TONES = { neutral: "bg-pulse-pressed text-pulse-text", alert: "bg-pulse-alert text-pulse-on-alert", accent: "bg-pulse-accent text-pulse-on-accent" };

/**
 * Unread / mention count. Shows up to `max` then "{max}+"; `label` completes the accessible text
 * ("3 unread mentions"), so the number is never announced on its own. `neutral` (default) for plain counts,
 * `alert` for mentions, `accent` only where the count means "new" or "selected" (gold stays rare).
 */
export function CountBadge({ count, label, tone = "neutral", max = 99, className }: { count: number; label: string; tone?: keyof typeof COUNT_TONES; max?: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-pulse-text text-pulse-caption font-bold tabular-nums",
        COUNT_TONES[tone],
        className,
      )}
    >
      <span aria-hidden>{count > max ? `${max}+` : count}</span>
      <span className="sr-only">{`${count} ${label}`}</span>
    </span>
  );
}

/**
 * Status pill ("Live", "Muted", "Admin"): tinted surface, a coloured leading mark and the status as text,
 * so the state never rests on colour alone.
 */
export function StatusBadge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-pulse-control px-2 font-pulse-text text-pulse-caption font-semibold text-pulse-text", TINT[tone], className)}>
      {icon ? <span className="inline-flex [&_svg]:size-3.5" aria-hidden>{icon}</span> : <span className={cn("size-1.5 rounded-full", MARK[tone])} aria-hidden />}
      {children}
    </span>
  );
}
