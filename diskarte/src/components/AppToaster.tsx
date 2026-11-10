"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { PULSE_TOAST_CLASSES } from "@/components/pulse/toast";

const QUERY = "(max-width: 639px)";

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** <html data-shell> / data-color-mode, which setShell and the display settings flip in place. */
function subscribeRoot(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-shell", "data-color-mode"] });
  return () => observer.disconnect();
}

const CLASSIC_TOAST = {
  toast: "!bg-panel/95 !backdrop-blur-md !border !border-white/10 !text-slate-100 !rounded-xl",
  description: "!text-slate-400",
};

/**
 * Toasts sit bottom-right on desktop, lifted above the workspace tray (call controls, minimized
 * panels: 56 px tray + 12 px frame). On phones they'd cover the composer and call controls (and
 * swallow taps) for several seconds — so small screens get them at the top instead.
 * In the Pulse shell they take Pulse styling and follow the colour mode.
 */
export function AppToaster() {
  const small = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  const root = useSyncExternalStore(
    subscribeRoot,
    () => `${document.documentElement.dataset.shell}:${document.documentElement.dataset.colorMode}`,
    () => "classic:dark",
  );
  const pulse = root.startsWith("pulse:");
  return (
    <Toaster
      theme={pulse && root.endsWith(":light") ? "light" : "dark"}
      position={small ? "top-center" : "bottom-right"}
      offset={small ? { top: "max(0.75rem, env(safe-area-inset-top))" } : { bottom: 80 }}
      toastOptions={{ classNames: pulse ? PULSE_TOAST_CLASSES : CLASSIC_TOAST }}
    />
  );
}
