"use client";

import { Check, ExternalLink, LifeBuoy, RotateCcw, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { setReportStatusAction } from "@/actions/admin";
import type { AdminSnapshot } from "@/lib/admin";
import { REPORT_CATEGORIES, REPORT_STATUS_LABEL, type ProblemReport } from "@/lib/reports";
import { cn } from "@/lib/utils";
import { formatAbsolute } from "./format";
import { SectionLabel, SELECT } from "./primitives";

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "sent", label: "Escalated" },
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

const BUTTON = "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-50 pointer-coarse:h-11";

/** Problem reports from users: triage them manually while preserving historical issue links. */
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
  const category = REPORT_CATEGORIES.find((c) => c.value === report.category)?.label ?? report.category;

  const setStatus = (status: "open" | "resolved" | "dismissed") =>
    start(async () => {
      const result = await setReportStatusAction({ reportId: report.id, status });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't update the report.");
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

        <div className="flex flex-wrap gap-1.5">
          {report.issue_url && (
            <a href={report.issue_url} target="_blank" rel="noopener noreferrer" className={cn(BUTTON, "text-sky-300 hover:bg-sky-500/10")}>
              <ExternalLink className="size-3.5" aria-hidden /> Issue
            </a>
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
    </li>
  );
}
