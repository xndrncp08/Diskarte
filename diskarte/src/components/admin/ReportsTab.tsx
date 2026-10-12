"use client";

import { Bot, Check, ExternalLink, LifeBuoy, RotateCcw, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { sendToFixAgentAction, setReportStatusAction } from "@/actions/admin";
import type { AdminSnapshot } from "@/lib/admin";
import { issueDraft, REPORT_CATEGORIES, REPORT_STATUS_LABEL, type ProblemReport } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { formatAbsolute } from "./format";
import { SectionLabel, SELECT } from "./primitives";

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "sent", label: "With fix agent" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "Every report" },
] as const;

const STATUS_STYLE: Record<ProblemReport["status"], string> = {
  open: "bg-sun/15 text-sun",
  sent: "bg-sky-500/15 text-sky-300",
  resolved: "bg-emerald-500/15 text-emerald-300",
  dismissed: "bg-white/5 text-slate-400",
};

const FIELD =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sun/70 focus:ring-2 focus:ring-sun/20";
const BUTTON = "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 pointer-coarse:h-11";

/** Problem reports from users: triage them, or hand one to the fix agent as a GitHub issue. */
export function ReportsTab({ snapshot, onChanged }: { snapshot: AdminSnapshot; onChanged: () => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("open");
  const names = useMemo(() => new Map(snapshot.users.map((u) => [u.id, u.display_name])), [snapshot.users]);

  if (!snapshot.reports) {
    return (
      <p className="m-3 rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400" role="status">
        Reports need the latest database migration (<code>20261012000000_problem_reports.sql</code>).
      </p>
    );
  }
  const reports = snapshot.reports.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="flex items-center gap-1.5">
          <LifeBuoy className="size-3.5" aria-hidden /> Problem reports
        </SectionLabel>
        <select aria-label="Filter reports" className={SELECT} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">Nothing here.</p>
      ) : (
        <ol className="space-y-2" aria-label="Reports">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} reporter={names.get(r.reporter_id) ?? "Unknown account"} onChanged={onChanged} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ReportCard({ report, reporter, onChanged }: { report: ProblemReport; reporter: string; onChanged: () => void }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const category = REPORT_CATEGORIES.find((c) => c.value === report.category)?.label ?? report.category;

  const setStatus = (status: "open" | "resolved" | "dismissed") =>
    start(async () => {
      const result = await setReportStatusAction({ reportId: report.id, status });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't update the report.");
      onChanged();
    });

  const send = () =>
    start(async () => {
      if (!draft) return;
      const result = await sendToFixAgentAction({ reportId: report.id, ...draft });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't reach the fix agent.");
      toast.success("Sent. The fix agent will open a pull request for review.");
      setDraft(null);
      onChanged();
    });

  return (
    <li className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" data-testid="report-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-semibold", STATUS_STYLE[report.status])}>{REPORT_STATUS_LABEL[report.status]}</span>
        <span className="font-semibold text-white">{category}</span>
        <span className="text-slate-500">
          {reporter} · <time dateTime={report.created_at}>{formatAbsolute(report.created_at)}</time>
          {report.page_url && <> · {report.page_url}</>}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{report.description}</p>

      {draft ? (
        <div className="space-y-2 rounded-lg border border-sky-400/20 bg-sky-500/5 p-2.5">
          <p className="text-xs text-sky-200">This becomes a public GitHub issue. Remove names, emails and anything private before sending.</p>
          <input aria-label="Issue title" value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={cn(FIELD, "h-9 font-semibold")} />
          <textarea aria-label="Issue description" value={draft.body} maxLength={6000} rows={7} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={cn(FIELD, "resize-y py-2 font-mono text-[12px] leading-relaxed")} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className={cn(BUTTON, "text-slate-300 hover:bg-white/10")}>
              Cancel
            </button>
            <button type="button" onClick={send} disabled={pending} className={cn(BUTTON, "bg-sky-500 text-abyss hover:bg-sky-400")}>
              <Bot className="size-3.5" aria-hidden /> Send to fix agent
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {report.issue_url && (
            <a href={report.issue_url} target="_blank" rel="noopener noreferrer" className={cn(BUTTON, "text-sky-300 hover:bg-sky-500/10")}>
              <ExternalLink className="size-3.5" aria-hidden /> Issue
            </a>
          )}
          {report.status === "open" && (
            <button type="button" onClick={() => setDraft(issueDraft(report))} className={cn(BUTTON, "bg-sky-500/15 text-sky-200 hover:bg-sky-500/25")}>
              <Bot className="size-3.5" aria-hidden /> Fix with agent
            </button>
          )}
          {report.status !== "resolved" && (
            <button type="button" onClick={() => setStatus("resolved")} disabled={pending} className={cn(BUTTON, "text-emerald-300 hover:bg-emerald-500/10")}>
              <Check className="size-3.5" aria-hidden /> Resolve
            </button>
          )}
          {report.status === "open" && (
            <button type="button" onClick={() => setStatus("dismissed")} disabled={pending} className={cn(BUTTON, "text-slate-400 hover:bg-white/10")}>
              <X className="size-3.5" aria-hidden /> Dismiss
            </button>
          )}
          {report.status !== "open" && (
            <button type="button" onClick={() => setStatus("open")} disabled={pending} className={cn(BUTTON, "text-slate-400 hover:bg-white/10")}>
              <RotateCcw className="size-3.5" aria-hidden /> Reopen
            </button>
          )}
        </div>
      )}
    </li>
  );
}
