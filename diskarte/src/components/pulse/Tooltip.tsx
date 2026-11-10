"use client";

import type { ComponentProps, ReactNode } from "react";
import { Tooltip as BaseTooltip, TooltipSkinContext } from "@/components/ui/Tooltip";

export const PULSE_TIP = "z-(--pulse-z-overlay) rounded-pulse-control border border-pulse-line bg-pulse-raised px-2.5 py-1 font-pulse-text text-pulse-caption font-semibold text-pulse-text shadow-pulse-2";

/**
 * Pulse Tooltip: the shared Tooltip (portalled, flips at viewport edges, opens on hover and focus, Escape
 * closes) in a raised Pulse bubble. Purely visual (aria-hidden): the trigger must carry its own accessible
 * name, so never put information only here. Props are the shared Tooltip's (`label`, `side`, `disabled`).
 */
export function Tooltip(props: Omit<ComponentProps<typeof BaseTooltip>, "tipClassName">) {
  return <BaseTooltip side="top" {...props} tipClassName={PULSE_TIP} />;
}

/** Gives reused Classic tooltips below it the Pulse bubble (the Pulse shell wraps its tree in this, like PulseMenuSkin). */
export function PulseTooltipSkin({ children }: { children: ReactNode }) {
  return <TooltipSkinContext.Provider value={PULSE_TIP}>{children}</TooltipSkinContext.Provider>;
}
