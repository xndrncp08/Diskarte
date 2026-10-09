"use client";

import { ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { auditLabel, PLATFORM_ROLE_LABEL, type AdminSnapshot, type AuditEntry, type PlatformRole } from "@/lib/admin";
import { formatAbsolute } from "./format";
import { SectionLabel, SELECT } from "./primitives";

const GROUPS: { value: string; label: string; match: (action: string) => boolean }[] = [
  { value: "all", label: "Every action", match: () => true },
  { value: "roles", label: "Roles", match: (a) => a === "user.role_update" },
  { value: "status", label: "Status overrides", match: (a) => a === "user.status_override" },
  { value: "sessions", label: "Session revocations", match: (a) => a === "user.sessions_revoke" },
  { value: "bans", label: "Bans", match: (a) => a === "user.ban" || a === "user.unban" },
  { value: "broadcasts", label: "Broadcasts", match: (a) => a.startsWith("broadcast.") },
  { value: "waitlist", label: "Archived waitlist", match: (a) => a === "waitlist.archived" },
];

function role(value: unknown) {
  return typeof value === "string" && value in PLATFORM_ROLE_LABEL ? PLATFORM_ROLE_LABEL[value as PlatformRole] : String(value ?? "");
}

/** One readable line of context for an entry's details. */
export function auditDetail(e: AuditEntry): string {
  const d = e.details ?? {};
  switch (e.action) {
    case "user.role_update":
      return `${role(d.from)} → ${role(d.to)}`;
    case "user.status_override":
      return [d.status, d.custom_status].filter(Boolean).join(" · ");
    case "user.sessions_revoke":
      return `${Number(d.sessions ?? 0)} session${Number(d.sessions) === 1 ? "" : "s"} ended`;
    case "user.ban":
      return `${d.permanent ? "Permanent" : `${Number(d.hours)}h`}${d.reason ? ` · ${String(d.reason)}` : ""}`;
    case "broadcast.dispatch":
      return `${String(d.title ?? "")}${d.sticky ? " · sticky banner" : ""}`;
    case "waitlist.archived":
      return `${String(d.full_name ?? "")} <${String(d.email ?? "")}> · ${String(d.status ?? "")}`;
    default:
      return "";
  }
}

/** The admin audit trail (admin_audit_logs): who did what to whom, newest first. */
export function AuditTab({ snapshot }: { snapshot: AdminSnapshot }) {
  const [group, setGroup] = useState("all");
  const names = useMemo(() => new Map(snapshot.users.map((u) => [u.id, u.display_name])), [snapshot.users]);
  const match = GROUPS.find((g) => g.value === group)?.match ?? (() => true);
  const entries = snapshot.audit.filter((e) => match(e.action));
  const name = (id: string | null) => (id ? (names.get(id) ?? "Unknown account") : "System");

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel className="flex items-center gap-1.5">
          <ScrollText className="size-3.5" aria-hidden /> Audit trail
        </SectionLabel>
        <select aria-label="Filter audit entries" className={SELECT} value={group} onChange={(e) => setGroup(e.target.value)}>
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">No entries yet.</p>
      ) : (
        <ol className="space-y-1" aria-label="Audit entries">
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2" data-testid="audit-row">
              <time dateTime={e.created_at} className="pt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                {formatAbsolute(e.created_at)}
              </time>
              <p className="min-w-0 text-sm text-slate-300">
                <span className="font-semibold text-white">{name(e.actor_id)}</span> <span className="text-slate-400">{auditLabel(e.action).toLowerCase()}</span>
                {e.target_user_id && <span className="font-semibold text-white"> {name(e.target_user_id)}</span>}
                {auditDetail(e) && <span className="block truncate text-xs text-slate-500">{auditDetail(e)}</span>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
