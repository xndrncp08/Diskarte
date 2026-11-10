"use client";

import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * Nothing here yet: an optional icon in a raised neutral tile, a title (h3 by default; `headingLevel`
 * to fit the page outline), one or two sentences saying what will appear and how, and an optional action.
 */
export function EmptyState({ title, children, icon, action, headingLevel = 3, className }: { title: string; children: ReactNode; icon?: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 | 4; className?: string }) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={cn("flex min-h-44 flex-col items-center justify-center gap-3 px-4 py-8 text-center", className)}>
      {icon && (
        <span className="grid size-12 place-items-center rounded-pulse-item bg-pulse-raised text-pulse-muted [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
      )}
      <Heading className="font-pulse-display text-pulse-title font-semibold text-pulse-text">{title}</Heading>
      <p className="max-w-sm font-pulse-text text-pulse-body text-pulse-muted">{children}</p>
      {action}
    </div>
  );
}

/**
 * What went wrong, plainly ("Couldn't load messages"), what the person can do (`children`), and a Retry
 * button when `onRetry` is given (`retrying` shows its spinner). role="alert" announces it when it appears.
 */
export function ErrorState({ title, children, onRetry, retrying = false, className }: { title: string; children: ReactNode; onRetry?: () => void; retrying?: boolean; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-pulse-card border border-pulse-line bg-pulse-surface px-4 py-8 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-pulse-item bg-pulse-mention text-pulse-alert" aria-hidden>
        <AlertTriangle className="size-5" />
      </span>
      <h3 className="font-pulse-display text-pulse-title font-semibold text-pulse-text">{title}</h3>
      <p className="max-w-sm font-pulse-text text-pulse-body text-pulse-muted">{children}</p>
      {onRetry && (
        <Button variant="secondary" icon={<RotateCw />} loading={retrying} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** A placeholder block while content loads: raised surface, gentle opacity pulse only under `pulse-motion`. Decorative. */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block rounded-pulse-control bg-pulse-raised pulse-motion:animate-pulse", className)} aria-hidden />;
}

/** Placeholder rows shaped like canvas messages (avatar, name, two lines), announced once as `label`. */
export function SkeletonRows({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className={cn("h-3", i % 2 ? "w-2/3" : "w-11/12")} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inline spinner with visible text (`label`), role="status" so it is announced politely. */
export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 font-pulse-text text-pulse-label text-pulse-muted", className)}>
      <Loader2 className="size-4 animate-spin text-pulse-muted" aria-hidden />
      {label}
    </span>
  );
}
