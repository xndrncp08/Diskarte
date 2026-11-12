import { SalakotAvatar } from "@/components/profile/SalakotAvatar";
import type { AvatarProfile } from "@/components/profile/UserAvatar";
import { STATUS_LABELS } from "@/components/retro/PixelStatus";
import { SmartImage } from "@/components/ui/SmartImage";
import type { StatusTone } from "@/lib/presence";
import { cn, initials } from "@/lib/utils";

export type PresenceStatus = Exclude<StatusTone, "custom">;

// 12-unit shapes: online a full disc, idle a crescent, dnd a disc with a bar cut out, offline/invisible a ring.
const DISC = "M6 0A6 6 0 1 1 6 12A6 6 0 1 1 6 0Z";
const SHAPES: Record<PresenceStatus, string> = {
  online: DISC,
  idle: "M6 0A6 6 0 1 0 12 6A6 6 0 0 1 6 0Z",
  dnd: `${DISC}M3 4.75h6v2.5H3Z`,
  offline: `${DISC}M6 3A3 3 0 1 0 6 9A3 3 0 1 0 6 3Z`,
  invisible: `${DISC}M6 3A3 3 0 1 0 6 9A3 3 0 1 0 6 3Z`,
};
const COLORS: Record<PresenceStatus, string> = {
  online: "text-pulse-online",
  idle: "text-pulse-idle",
  dnd: "text-pulse-dnd",
  offline: "text-pulse-offline",
  invisible: "text-pulse-offline",
};

/**
 * Presence dot. Each status has its own shape (disc, crescent, barred disc, ring) as well as its colour,
 * and the status name is the accessible name (role="img"), so it never rests on colour alone. Sits on a
 * surface-coloured ring so it reads over any avatar. `size` is the dot in px (ring excluded).
 */
export function PresenceDot({ status, size = 10, className }: { status: PresenceStatus; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full bg-pulse-surface p-0.5", className)} data-status={status}>
      <svg viewBox="0 0 12 12" width={size} height={size} role="img" aria-label={STATUS_LABELS[status]} className={COLORS[status]}>
        <path d={SHAPES[status]} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/**
 * A person's avatar: always a circle (Spaces use the square <Monogram>). Their photo, or their Salakot
 * preset when they have none. Decorative by default because the name is usually beside it; pass
 * `labelled` when it stands alone (the name becomes the image's accessible name). `status` adds a PresenceDot;
 * `speaking` adds a live halo plus a ring (shape, not just colour).
 */
export function Avatar({ profile, size = 40, status, speaking = false, labelled = false, className }: { profile: AvatarProfile; size?: number; status?: PresenceStatus; speaking?: boolean; labelled?: boolean; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 rounded-full", speaking && "ring-2 ring-pulse-live ring-offset-2 ring-offset-pulse-surface shadow-[0_0_0_6px_var(--pulse-speaking-tint)]", className)}
      style={{ width: size, height: size }}
      role={labelled ? "img" : undefined}
      // An img's children are presentational, so a labelled avatar carries the status in its own name.
      aria-label={labelled ? (status ? `${profile.display_name} (${STATUS_LABELS[status]})` : profile.display_name) : undefined}
      data-speaking={speaking || undefined}
    >
      {profile.avatar_url ? (
        <SmartImage src={profile.avatar_url} alt="" width={size} height={size} className="size-full rounded-full object-cover" />
      ) : (
        <SalakotAvatar preset={profile.avatar_preset} size={size} />
      )}
      {status && <PresenceDot status={status} size={Math.max(8, Math.round(size * 0.26))} className="absolute -bottom-0.5 -right-0.5" />}
    </span>
  );
}

/**
 * A Space's tile: a square with the monogram radius (7 px) (never a circle, never morphing on hover), the Space's icon or
 * its initials in the display face. Decorative by default; pass `labelled` when no visible name is beside it.
 * `selected` adds the accent edge used in the Spaces navigator.
 */
export function Monogram({ name, src, size = 40, selected = false, labelled = false, className }: { name: string; src?: string | null; size?: number; selected?: boolean; labelled?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pulse-monogram border bg-pulse-raised font-pulse-display font-semibold text-pulse-text",
        selected ? "border-pulse-accent-mark shadow-[0_0_0_1px_var(--pulse-accent-mark)]" : "border-pulse-line",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
    >
      {src ? <SmartImage src={src} alt="" width={size} height={size} className="size-full object-cover" /> : <span aria-hidden>{initials(name)}</span>}
    </span>
  );
}

/**
 * Overlapping avatars for "who's here" (a voice room, an event's going list). Shows up to `max` faces, then a
 * "+N" circle. Each face sits on a surface-coloured ring; `speaking: true` on a person swaps it for a live-teal
 * ring with a gap (an extra ring, so a shape change too). One role="img" whose name lists the shown people
 * (with "speaking") and "and N more", or pass `label` to name the group yourself.
 */
export function AvatarStack({ people, max = 4, size = 28, label, className }: { people: (AvatarProfile & { speaking?: boolean })[]; max?: number; size?: number; label?: string; className?: string }) {
  const shown = people.slice(0, people.length > max ? max - 1 : max);
  const rest = people.length - shown.length;
  const names = shown.map((p) => (p.speaking ? `${p.display_name} (speaking)` : p.display_name));
  const name = label ?? (rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", "));
  return (
    <span role="img" aria-label={name} className={cn("inline-flex items-center", className)}>
      {shown.map((p, i) => (
        <span
          key={`${p.display_name}-${i}`}
          className={cn("inline-flex rounded-full", i > 0 && "-ml-2", p.speaking ? "z-(--pulse-z-raised) ring-2 ring-pulse-live ring-offset-2 ring-offset-pulse-surface" : "ring-2 ring-pulse-surface")}
          data-speaking={p.speaking || undefined}
        >
          <Avatar profile={p} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span className="-ml-2 inline-flex items-center justify-center rounded-full bg-pulse-raised font-pulse-text text-pulse-caption font-semibold text-pulse-muted ring-2 ring-pulse-surface" style={{ width: size, height: size }}>
          +{rest}
        </span>
      )}
    </span>
  );
}
