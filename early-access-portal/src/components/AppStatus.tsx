"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Status = "checking" | "online" | "waking";

/**
 * Live badge for the Diskarte app on Render (cross-origin /api/health, allowed by the app's CORS
 * policy for EARLY_ACCESS_URL). Render's free tier sleeps, so a slow/failed check reads as
 * "waking up" rather than "down".
 */
export function AppStatus({ appUrl }: { appUrl: string }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    fetch(`${appUrl}/api/health`, { signal: controller.signal, mode: "cors", cache: "no-store" })
      .then((res) => setStatus(res.ok ? "online" : "waking"))
      .catch(() => setStatus("waking"))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [appUrl]);

  const label = status === "online" ? "Diskarte is live" : status === "waking" ? "Gumigising ang server" : "Chine-check…";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-slate-300" role="status" data-status={status}>
      <span className="relative flex size-2">
        {status === "online" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", status === "online" ? "bg-emerald-400" : status === "waking" ? "bg-sun" : "bg-slate-500")} />
      </span>
      {label}
    </span>
  );
}
