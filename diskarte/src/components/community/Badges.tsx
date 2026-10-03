import { Glyph } from "@/components/ui/Glyph";
import { BADGES, BADGE_KINDS } from "@/lib/community";
import type { BadgeKind } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/** Supporter badges: compact icon flair (member rows) or labelled chips (profile cards). */
export function Badges({ badges, compact = false, className }: { badges: BadgeKind[] | undefined; compact?: boolean; className?: string }) {
  if (!badges?.length) return null;
  const ordered = BADGE_KINDS.filter((b) => badges.includes(b));
  if (compact) {
    return (
      <span className={cn("flex shrink-0 items-center gap-0.5 text-[11px] leading-none", className)}>
        {ordered.map((b) => (
          <span key={b} title={BADGES[b].label} aria-label={BADGES[b].label} role="img">
            <Glyph code={BADGES[b].glyph} className="size-3.5" />
          </span>
        ))}
      </span>
    );
  }
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label="Badges">
      {ordered.map((b) => (
        <li key={b} className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold", BADGES[b].className)} title={BADGES[b].description}>
          <Glyph code={BADGES[b].glyph} className="size-3.5" tinted={false} />
          {BADGES[b].label}
        </li>
      ))}
    </ul>
  );
}
