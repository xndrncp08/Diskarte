import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** CSS-only tooltip shown on hover/focus-within; the trigger keeps its own accessible name. */
export function Tooltip({ label, side = "right", children, className }: { label: string; side?: "right" | "top" | "bottom"; children: ReactNode; className?: string }) {
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="presentation"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-black/90 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-100",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          side === "right" && "left-full top-1/2 ml-3 -translate-y-1/2",
          side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2",
          side === "bottom" && "left-1/2 top-full mt-2 -translate-x-1/2",
        )}
      >
        {label}
      </span>
    </span>
  );
}
