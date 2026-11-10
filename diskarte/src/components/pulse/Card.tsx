import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PulseSurface } from "./PulseSurface";

/**
 * Pulse card: a PulseSurface (surface or raised, card radius, hairline edge) with padding and an optional
 * header. `title` renders an <h3> in the display face; `action` sits at the header's end. Use `raised` for a
 * card on a surface. Content decides the semantics: wrap the card in a link or button yourself when it navigates.
 */
export function Card({ title, action, raised, className, children, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { title?: string; action?: ReactNode; raised?: boolean }) {
  return (
    <PulseSurface raised={raised} className={cn("p-4", className)} {...props}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="min-w-0 truncate font-pulse-display text-pulse-title font-semibold">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </PulseSurface>
  );
}

const SPAN = { one: "", wide: "sm:col-span-2", tall: "sm:row-span-2", hero: "sm:col-span-2 sm:row-span-2" } as const;

/**
 * Bento tile for community pages (About, Events, Hangouts at a glance). Lives in a <BentoGrid>; `span`
 * makes it two columns wide, two rows tall, or both (`hero`) from the sm breakpoint up; on phones every
 * tile is full width. `eyebrow` is a small muted kicker above the title.
 */
export function BentoTile({ eyebrow, title, span = "one", className, children, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "title"> & { eyebrow?: string; title: string; span?: keyof typeof SPAN }) {
  return (
    <PulseSurface className={cn("flex min-h-36 flex-col gap-2 p-5", SPAN[span], className)} {...props}>
      {eyebrow && <p className="font-pulse-text text-pulse-caption font-semibold uppercase tracking-wide text-pulse-muted">{eyebrow}</p>}
      <h3 className={cn("font-pulse-display font-semibold text-pulse-text", span === "hero" ? "text-pulse-display" : "text-pulse-title")}>{title}</h3>
      <div className="min-h-0 flex-1 font-pulse-text text-pulse-body text-pulse-muted">{children}</div>
    </PulseSurface>
  );
}

/** One column on phones, two from sm, four from lg; rows grow with the tallest tile. */
export function BentoGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} {...props} />;
}
