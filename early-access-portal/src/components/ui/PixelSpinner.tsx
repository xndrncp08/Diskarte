import { cn } from "@/lib/utils";

/** Three 8-bit blocks hopping in turn (CSS-only; frozen when reduced motion is on). */
export function PixelSpinner({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-end gap-0.5", className)} aria-hidden data-testid="pixel-spinner">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pixel-hop bg-current" style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}
