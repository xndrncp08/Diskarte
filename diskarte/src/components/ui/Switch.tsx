"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The look of a switch; `track` and `knob` take the checked state. Role, labelling and keys never change. */
export interface SwitchSkin {
  label: string;
  hint: string;
  track: (checked: boolean) => string;
  knob: (checked: boolean) => string;
  /** Added to the row while disabled. */
  disabled: string;
}

export const CLASSIC_SWITCH: SwitchSkin = {
  label: "block text-sm font-semibold text-white",
  hint: "block text-xs text-slate-400",
  disabled: "opacity-50",
  track: (checked) => cn("ui-switch touch-target relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed", checked ? "border-sun bg-sun" : "border-white/20 bg-white/10"),
  knob: (checked) => cn("ui-switch-knob absolute left-0.5 top-0.5 size-[18px] bg-abyss", checked ? "translate-x-5" : "translate-x-0"),
};

/** Pixel-knob toggle (role="switch") with a label and optional hint. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
  className,
  skin = CLASSIC_SWITCH,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  skin?: SwitchSkin;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && skin.disabled, className)}>
      <span className="min-w-0">
        <span id={labelId} className={skin.label}>
          {label}
        </span>
        {hint && (
          <span id={hintId} className={skin.hint}>
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
        className={skin.track(checked)}
      >
        <span className={skin.knob(checked)} aria-hidden />
      </button>
    </div>
  );
}
