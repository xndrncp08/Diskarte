"use client";

import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useMinimumLoading } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "live";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-pulse-accent text-pulse-on-accent shadow-pulse-1 hover:brightness-105 active:brightness-95",
  secondary: "border border-pulse-input text-pulse-text hover:bg-pulse-hover active:bg-pulse-pressed",
  quiet: "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text active:bg-pulse-pressed",
  danger: "bg-pulse-alert text-pulse-on-alert shadow-pulse-1 hover:brightness-105 active:brightness-95",
  live: "bg-pulse-live text-pulse-on-live shadow-pulse-1 hover:brightness-105 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-pulse-label",
  md: "h-10 gap-2 px-4 text-pulse-body",
  lg: "h-12 gap-2 px-5 text-pulse-lead",
};
const ICON_SIZES: Record<ButtonSize, string> = { sm: "size-8", md: "size-10", lg: "size-12" };

// Real 44 px boxes on touch screens (min-height beats height), and a 0.97 press only when motion is welcome.
const BASE =
  "relative inline-flex shrink-0 items-center justify-center rounded-pulse-control font-pulse-text font-semibold select-none pointer-coarse:min-h-11 " +
  "transition-[background-color,color,filter,transform] duration-(--pulse-dur-press) ease-(--pulse-ease) pulse-motion:active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:not-aria-busy:border-transparent disabled:not-aria-busy:bg-pulse-raised disabled:not-aria-busy:text-pulse-disabled disabled:not-aria-busy:shadow-none aria-busy:cursor-progress";

/** The Button look for a link that acts as one (a Next <Link> to a page): same variants and sizes, 44 px on touch. */
export const buttonClasses = (variant: ButtonVariant = "secondary", size: ButtonSize = "md") => cn(BASE, VARIANTS[variant], SIZES[size]);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner (held ≥ 300 ms so fast replies don't flash it), disables the button and sets aria-busy. */
  loading?: boolean;
  /** Leading icon, decorative (the text names the button). */
  icon?: ReactNode;
}

/**
 * Pulse Button. `primary` is the one solar-gold action per view (on-accent text); `secondary` an outlined
 * alternative; `quiet` a text-only action; `danger` destructive (on-alert text); `live` joins or controls
 * voice (on-live text). Sizes sm 32 / md 40 / lg 48 px, every size 44 px tall on coarse pointers.
 * A11y: a native <button type="button">; disabled and loading both block clicks, loading adds aria-busy.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading: loadingProp = false, icon, disabled, className, children, type = "button", ...props },
  ref,
) {
  const loading = useMinimumLoading(loadingProp);
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} data-variant={variant} className={cn(buttonClasses(variant, size), className)} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon && <span className="inline-flex [&_svg]:size-4" aria-hidden>{icon}</span>}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "aria-label"> {
  /** Required accessible name (aria-label); also the tooltip text when `tooltip` is set. */
  label: string;
  icon: ReactNode;
  /** Show `label` in a Pulse Tooltip on hover and focus. */
  tooltip?: boolean;
}

/**
 * Icon-only Pulse button. `label` is required by type, and an empty one is reported in development, because
 * an icon alone has no accessible name. Defaults to the `quiet` variant; square at every size, 44 px on touch.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tooltip = false, variant = "quiet", size = "md", className, ...props },
  ref,
) {
  if (process.env.NODE_ENV !== "production" && !label?.trim()) console.error("Pulse IconButton needs a non-empty `label`: an icon alone has no accessible name.");
  const button = (
    <Button ref={ref} aria-label={label} icon={icon} variant={variant} size={size} className={cn(ICON_SIZES[size], "px-0 pointer-coarse:min-w-11", className)} {...props} />
  );
  return tooltip ? <Tooltip label={label} side="top">{button}</Tooltip> : button;
});
