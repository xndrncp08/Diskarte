import { cn } from "@/lib/utils";

/**
 * The sun pulse line: the "new since" separator on the Conversation Canvas (and any divider that marks
 * a fresh boundary). A gold rule with an optional label pill ("New since 3:42 PM") and a glint that
 * travels along it; the glint only runs under `pulse-motion` (no reduced-motion request from the OS or
 * Settings). A11y: role="separator" named by `label`; the pill text carries the meaning, not the gold.
 */
export function PulseLine({ label, className }: { label?: string; className?: string }) {
  return (
    <div role="separator" aria-label={label} className={cn("flex items-center gap-2 py-2", className)}>
      <span className="relative h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-pulse-accent-mark" aria-hidden>
        <span className="absolute inset-y-0 left-0 hidden w-1/5 bg-linear-to-r from-transparent via-pulse-surface/70 to-transparent pulse-motion:block pulse-motion:animate-pulse-travel" />
      </span>
      {label && (
        <span className="shrink-0 rounded-full bg-pulse-accent px-2.5 py-0.5 font-pulse-text text-pulse-caption font-bold text-pulse-on-accent" aria-hidden>
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * Live indicator: a live-teal dot with a ripple (only under `pulse-motion`) and the word "Live" (or `label`).
 * The text is always present, visibly or (`hideLabel`) for screen readers only, so live never rests on colour or motion.
 */
export function LiveIndicator({ label = "Live", hideLabel = false, className }: { label?: string; hideLabel?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-pulse-text text-pulse-caption font-semibold text-pulse-live", className)}>
      <span className="relative inline-flex size-2" aria-hidden>
        <span className="absolute inset-0 hidden rounded-full bg-pulse-live pulse-motion:block pulse-motion:animate-pulse-ripple" />
        <span className="relative size-2 rounded-full bg-pulse-live" />
      </span>
      <span className={cn(hideLabel && "sr-only")}>{label}</span>
    </span>
  );
}
