"use client";

import { Activity, Megaphone, Radio, RefreshCw, ScrollText, ShieldCheck } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AuditTab } from "./AuditTab";
import { BroadcastComposer } from "./BroadcastComposer";
import { formatAbsolute } from "./format";
import { NetworkTab } from "./NetworkTab";
import { useAdminSnapshot, useNow } from "./useAdminSnapshot";
import { VoiceTab } from "./VoiceTab";

type Tab = "network" | "voice" | "broadcast" | "audit";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "network", label: "Network", icon: <Activity className="size-3.5" aria-hidden /> },
  { id: "voice", label: "Voice", icon: <Radio className="size-3.5" aria-hidden /> },
  { id: "broadcast", label: "Broadcast", icon: <Megaphone className="size-3.5" aria-hidden /> },
  { id: "audit", label: "Audit", icon: <ScrollText className="size-3.5" aria-hidden /> },
];

function Skeleton() {
  return (
    <div className="space-y-3 p-3" aria-hidden>
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.03]" />
      ))}
    </div>
  );
}

/**
 * The Super Admin Control Center: network roster and presence inspector, live voice stages, the
 * global announcement dispatcher and the audit trail. Rendered inside the workspace's admin panel
 * (tablet and up) or as the /tambayan/admin page on phones. Only mounted for verified super admins.
 */
export function AdminControlCenter({ className }: { className?: string }) {
  const [tab, setTab] = useState<Tab>("network");
  const [query, setQuery] = useState("");
  const snap = useAdminSnapshot(query);
  const now = useNow(5000);
  const base = useId();
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const target = e.key === "Home" ? TABS[0] : e.key === "End" ? TABS[TABS.length - 1] : step ? TABS[(i + step + TABS.length) % TABS.length] : null;
    if (!target) return;
    e.preventDefault();
    setTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <section aria-label="Super Admin Control Center" className={cn("@container flex min-h-0 min-w-0 flex-1 flex-col", className)} data-testid="admin-control-center">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <ShieldCheck className="size-4 text-sun" aria-hidden />
        <h2 className="font-pixel text-[10px] uppercase tracking-wider text-white">Control Center</h2>
        <span
          className={cn("ml-1 flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-silk text-[9px] uppercase tracking-wider", snap.live ? "border-signal-green/40 text-signal-green" : "border-white/10 text-slate-500")}
          title={snap.live ? "Receiving realtime updates" : "Refreshing every 15 seconds"}
        >
          <span className={cn("size-1.5", snap.live ? "animate-pulse bg-signal-green" : "bg-slate-500")} aria-hidden />
          {snap.live ? "Live" : "Polling"}
        </span>
        <span className="ml-auto hidden text-[11px] tabular-nums text-slate-500 @sm:inline">{snap.data ? `Updated ${formatAbsolute(snap.data.generatedAt)}` : ""}</span>
        <button type="button" onClick={snap.refresh} aria-label="Refresh" className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white">
          <RefreshCw className={cn("size-3.5", snap.loading && "animate-spin")} aria-hidden />
        </button>
      </header>

      <div role="tablist" aria-label="Control Center sections" className="flex shrink-0 gap-1 border-b border-white/[0.06] px-2 py-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${base}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={onTabKey}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-400 transition-colors hover:text-white aria-selected:bg-sun/15 aria-selected:text-sun pointer-coarse:h-11"
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {snap.error && (
        <p className="shrink-0 border-b border-signal-dnd/30 bg-signal-dnd/10 px-3 py-2 text-xs text-red-200" role="alert">
          {snap.error}
        </p>
      )}

      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {!snap.data ? (
          <Skeleton />
        ) : tab === "network" ? (
          <NetworkTab snapshot={snap.data} now={now} query={query} setQuery={setQuery} onChanged={snap.refresh} />
        ) : tab === "voice" ? (
          <VoiceTab snapshot={snap.data} now={now} />
        ) : tab === "broadcast" ? (
          <BroadcastComposer snapshot={snap.data} now={now} onChanged={snap.refresh} />
        ) : (
          <AuditTab snapshot={snap.data} />
        )}
      </div>
    </section>
  );
}
