import type { ToasterProps } from "sonner";

/**
 * Pulse toast styling for the one app-wide Sonner <Toaster> (AppToaster swaps it in while
 * <html data-shell="pulse">). Call `toast()` exactly as in Classic. `!` beats Sonner's own unlayered styles.
 */
export const PULSE_TOAST_CLASSES: NonNullable<NonNullable<ToasterProps["toastOptions"]>["classNames"]> = {
  toast: "!rounded-pulse-item !border !border-pulse-line !bg-pulse-raised !font-pulse-text !text-pulse-text !shadow-pulse-2",
  title: "!text-pulse-body !font-semibold",
  description: "!text-pulse-label !text-pulse-muted",
  actionButton: "!rounded-pulse-control !bg-pulse-accent !font-semibold !text-pulse-on-accent",
  cancelButton: "!rounded-pulse-control !bg-pulse-hover !text-pulse-text",
  success: "[&_[data-icon]]:!text-pulse-live",
  error: "[&_[data-icon]]:!text-pulse-alert",
  warning: "[&_[data-icon]]:!text-pulse-accent-ink",
  info: "[&_[data-icon]]:!text-pulse-people",
};
