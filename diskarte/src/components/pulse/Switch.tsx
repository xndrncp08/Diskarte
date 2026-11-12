"use client";

import type { ComponentProps } from "react";
import { Switch as BaseSwitch, type SwitchSkin } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";

// On touch the transparent border turns the 24 px track into a real 44 px box; the track itself is the padding box
// (bg-clip-padding) and its edge an inset shadow, so it looks the same at every pointer size.
const PULSE_SWITCH: SwitchSkin = {
  label: "block font-pulse-text text-pulse-body font-semibold text-pulse-text",
  hint: "block font-pulse-text text-pulse-caption text-pulse-muted",
  // Text stays readable while disabled; the greyed track and the not-allowed cursor say it can't change.
  disabled: "",
  track: (checked) =>
    cn(
      "relative box-content h-6 w-11 shrink-0 rounded-full bg-clip-padding transition-colors duration-(--pulse-dur-ui) disabled:cursor-not-allowed",
      "pointer-coarse:border-10 pointer-coarse:border-transparent",
      checked ? "bg-pulse-accent-mark disabled:bg-pulse-disabled" : "bg-pulse-raised shadow-[inset_0_0_0_1px_var(--pulse-input-border)]",
    ),
  knob: (checked) =>
    cn(
      "absolute left-0.5 top-0.5 size-5 rounded-full shadow-pulse-1 transition-transform duration-(--pulse-dur-ui) ease-(--pulse-ease)",
      checked ? "translate-x-5 bg-pulse-surface" : "translate-x-0 bg-pulse-faint",
    ),
};

/**
 * Pulse switch: the shared Switch (role="switch", aria-checked, labelled by `label`, described by `hint`)
 * with a gold-mark track when on, an input-border edge when off, and the knob's position as the
 * non-colour cue. Props are Switch's (`checked`, `onChange`, `label`, `hint`, `disabled`).
 */
export function Switch(props: Omit<ComponentProps<typeof BaseSwitch>, "skin">) {
  return <BaseSwitch {...props} skin={PULSE_SWITCH} />;
}
