"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

const QUERY = "(max-width: 639px)";

function subscribe(callback: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/**
 * Toasts sit bottom-right on desktop, but on phones they'd cover the composer and call controls
 * (and swallow taps) for several seconds — so small screens get them at the top instead.
 */
export function AppToaster() {
  const small = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return (
    <Toaster
      theme="dark"
      position={small ? "top-center" : "bottom-right"}
      offset={small ? { top: "max(0.75rem, env(safe-area-inset-top))" } : undefined}
      toastOptions={{
        classNames: {
          toast: "!bg-black/70 !backdrop-blur-md !border !border-white/10 !text-slate-100 !rounded-xl",
          description: "!text-slate-400",
        },
      }}
    />
  );
}
