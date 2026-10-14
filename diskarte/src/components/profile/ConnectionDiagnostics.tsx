"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { clearDiagnostics, recordDiagnostic, useDiagnostics } from "@/lib/diagnostics";

export function ConnectionDiagnostics() {
  const records = useDiagnostics();
  const [state, setState] = useState("Not checked");
  async function check() {
    setState("Checking…"); const start = performance.now();
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Unavailable");
      const elapsed = Math.round(performance.now() - start);
      recordDiagnostic("client", "connected", elapsed); setState(`App server reachable · ${elapsed} ms`);
    } catch { recordDiagnostic("client", "error"); setState("App server couldn’t be reached. Check your connection."); }
  }
  return <section className="mt-8 max-w-xl space-y-3">
    <h3 className="text-sm font-semibold">Connection diagnostics</h3><p className="text-xs text-slate-400">These last 100 connection events stay in this tab. They contain no messages, usernames, tokens or private URLs.</p>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void check()}>Check connection</Button><Button variant="ghost" onClick={clearDiagnostics}>Clear diagnostics</Button></div><p role="status" className="text-sm">{state}</p>
    <ol className="max-h-60 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-3 text-xs font-mono" aria-label="Recent connection events">{records.slice().reverse().map((item, index) => <li key={`${item.at}:${index}`}>{new Date(item.at).toLocaleTimeString()} · {item.scope} · {item.event}{item.latencyMs !== undefined ? ` · ${item.latencyMs} ms` : ""}</li>)}{!records.length && <li>No connection events recorded yet.</li>}</ol>
  </section>;
}
