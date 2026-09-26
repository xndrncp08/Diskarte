"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pixel-knob toggle (role="switch") with a label and optional hint. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && "opacity-50", className)}>
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-semibold text-white">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="block text-xs text-slate-400">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "touch-target relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed",
          checked ? "border-sun bg-sun" : "border-white/20 bg-white/10",
        )}
      >
        <span className={cn("absolute top-0.5 size-[18px] rounded-sm bg-abyss transition-[left] duration-150", checked ? "left-[22px]" : "left-0.5")} aria-hidden />
      </button>
    </div>
  );
}
