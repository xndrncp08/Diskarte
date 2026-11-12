import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A Pulse card: the reference for token-only styling. Files in components/pulse may not use raw
 * slate/gray/white/black utilities or [#hex] colours (lint-enforced); only Pulse tokens.
 */
export function PulseSurface({ raised, className, ...props }: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn("rounded-pulse-card border border-pulse-line text-pulse-text shadow-pulse-1", raised ? "bg-pulse-raised" : "bg-pulse-surface", className)}
      {...props}
    />
  );
}
