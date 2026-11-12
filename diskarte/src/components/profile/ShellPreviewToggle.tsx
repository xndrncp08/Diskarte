"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { usePlatformRole } from "@/components/admin/AdminAccess";
import { useOptionalRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { Switch } from "@/components/ui/Switch";
import { setShell } from "@/lib/shell";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-shell"] });
  return () => observer.disconnect();
}

/**
 * Settings → Appearance: optional Pulse presentation, available during the controlled rollout.
 * The server supplies availability; switching refreshes in place, so the session survives.
 */
export function ShellPreviewToggle() {
  const role = usePlatformRole();
  const router = useRouter();
  const publicOptIn = useOptionalRuntimeConfig()?.pulseOptIn === true;
  const pulse = useSyncExternalStore(subscribe, () => document.documentElement.dataset.shell === "pulse", () => false);
  if (!publicOptIn && role !== "super_admin") return null;
  return (
    <section className="mt-8 max-w-md space-y-3" data-testid="shell-preview">
      <h3 className="text-sm font-semibold text-white">The new Diskarte</h3>
      <Switch
        checked={pulse}
        onChange={(on) => setShell(on ? "pulse" : "classic", router)}
        label="Try the new Diskarte"
        hint="The Pulse redesign: a Spaces navigator, the conversation canvas and a Context sheet. Only you see it, in this browser. Turn it off any time."
      />
    </section>
  );
}
