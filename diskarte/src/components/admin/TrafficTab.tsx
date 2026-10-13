"use client";

import { BarChart3, ExternalLink } from "lucide-react";
import type { AdminSnapshot } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { SectionLabel } from "./primitives";

/** How many people opened Diskarte: unique browsers per Manila day, counted by the site itself. */
export function TrafficTab({ snapshot }: { snapshot: AdminSnapshot }) {
  const t = snapshot.traffic;
  if (!t) {
    return (
      <p className="m-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300" role="status">
        Visitor counts start once the <code className="font-mono text-xs">site_visits</code> migration is applied to the database.
      </p>
    );
  }
  const max = Math.max(1, ...t.daily.map((d) => d.count));
  const cards = [
    { label: "Today", value: t.today, tone: "text-white" },
    { label: "Signed in today", value: t.signed_in_today, tone: "text-signal-green" },
    { label: "7 days", value: t.week, tone: "text-sun" },
    { label: "30 days", value: t.month, tone: "text-neon" },
  ];
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <SectionLabel className="flex items-center gap-1.5">
        <BarChart3 className="size-3.5" aria-hidden /> Visitors
      </SectionLabel>
      <section aria-label="Visitors" className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5" data-testid={`traffic-${c.label.toLowerCase().replace(/\s/g, "-")}`}>
            <p className="font-silk text-[10px] uppercase tracking-wider text-slate-400">{c.label}</p>
            <CountUp value={c.value} className={cn("mt-1 block font-pixel text-base", c.tone)} />
          </div>
        ))}
        <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <p className="font-silk text-[10px] uppercase tracking-wider text-slate-400">Visitors · 30 days</p>
          <div className="mt-1.5 flex h-20 items-end gap-0.5" role="img" aria-label={t.daily.map((d) => `${d.day}: ${d.count}`).join(", ")}>
            {t.daily.map((d, i) => (
              <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                <div className="w-full rounded-t-sm bg-sun/80" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} title={`${d.day}: ${d.count}`} />
                <span className={cn("text-[9px] tabular-nums text-slate-500", i % 5 !== 4 && "invisible")}>{String(d.day).slice(8, 10)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <p className="text-xs text-slate-400">
        One count per browser per day; no IPs or names are stored. Pages, referrers and countries are in{" "}
        <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sun hover:underline">
          Vercel Analytics <ExternalLink className="size-3" aria-hidden />
        </a>
        .
      </p>
    </div>
  );
}
