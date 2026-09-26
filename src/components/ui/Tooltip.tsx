"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FloatingPortal, useFloating, type Side } from "./floating";

/**
 * Hover/focus tooltip rendered in a <body> portal so scrollable rails and sidebars can't clip it.
 * Purely visual (aria-hidden): the trigger keeps its own accessible name.
 */
export function Tooltip({
  label,
  side = "right",
  children,
  className,
  disabled = false,
}: {
  label: string;
  side?: Side;
  children: ReactNode;
  className?: string;
  /** Suppress while the trigger's own popover is open (they'd overlap). */
  disabled?: boolean;
}) {
  const [hovered, setOpen] = useState(false);
  const open = hovered && !disabled;
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const { style, side: resolved } = useFloating(open, anchor, tip, { side, align: "center", offset: 10 });

  return (
    <span
      ref={anchor}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      {children}
      {open && (
        <FloatingPortal>
          <span
            ref={tip}
            aria-hidden
            data-floating="tooltip"
            data-side={resolved}
            style={style}
            className="pointer-events-none z-50 whitespace-nowrap rounded-md bg-black/90 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
          >
            {label}
          </span>
        </FloatingPortal>
      )}
    </span>
  );
}
