"use client";

import { Ban, Hash, Loader2, MessageSquareX, RefreshCw, Settings, ShieldAlert, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Timestamp } from "@/components/chat/Timestamp";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { Button } from "@/components/ui/Button";
import { useProfileNames } from "@/hooks/useProfileNames";
import { AUDIT_FILTERS, auditExcerpt, describeAudit, type AuditEntry } from "@/lib/community";
import { cn } from "@/lib/utils";

const PAGE = 50;

function iconFor(action: string) {
  if (action.startsWith("automod.")) return <ShieldAlert className="size-4 text-sun" aria-hidden />;
  if (action === "member.ban" || action === "member.kick") return <Ban className="size-4 text-red-300" aria-hidden />;
  if (action.startsWith("member.")) return <UserCog className="size-4 text-sky-300" aria-hidden />;
  if (action.startsWith("channel.")) return <Hash className="size-4 text-emerald-300" aria-hidden />;
  if (action.startsWith("message.")) return <MessageSquareX className="size-4 text-orange-300" aria-hidden />;
  return <Settings className="size-4 text-slate-400" aria-hidden />;
}

/** Moderator audit trail: joins/leaves, role changes, bans, deleted messages, channel edits, auto-mod blocks. */
export function AuditLogPanel() {
  const supabase = useSupabase();
  const { server } = useServer();
  const [filter, setFilter] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      let query = supabase.from("audit_logs").select("*").eq("server_id", server.id);
      if (filter) query = query.like("action", `${filter}%`);
      if (before) query = query.lt("id", before);
      const { data } = await query.order("id", { ascending: false }).limit(PAGE + 1);
      const rows = data ?? [];
      setHasMore(rows.length > PAGE);
      setEntries((prev) => (before ? [...prev, ...rows.slice(0, PAGE)] : rows.slice(0, PAGE)));
      setLoading(false);
    },
    [supabase, server.id, filter],
  );

  useEffect(() => {
    // Fetching the log for the selected filter is the external sync this effect exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const name = useProfileNames(entries.flatMap((e) => [e.actor_id, e.target_id, typeof e.metadata === "object" && e.metadata && !Array.isArray(e.metadata) ? (e.metadata.author_id as string | undefined) : undefined]));

  return (
    <div className="space-y-3" data-testid="audit-log">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter audit log">
        {AUDIT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-semibold transition-colors pointer-coarse:py-2",
              filter === f.value ? "border-sun bg-sun text-abyss" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
            )}
          >
            {f.label}
          </button>
        ))}
        <button type="button" onClick={() => void load()} aria-label="Refresh audit log" className="touch-target relative ml-auto rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
        </button>
      </div>

      {entries.length === 0 && !loading ? (
        <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">Tahimik pa ang tambayan — wala pang naka-log.</p>
      ) : (
        <ol className="scrollbar-thin max-h-[50vh] space-y-1 overflow-y-auto pr-1" aria-label="Audit log entries">
          {entries.map((entry) => {
            const excerpt = auditExcerpt(entry);
            return (
              <li key={entry.id} className="flex gap-3 rounded-lg px-2 py-2 hover:bg-white/5" data-action={entry.action}>
                <span className="mt-0.5 shrink-0">{iconFor(entry.action)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{describeAudit(entry, name)}</p>
                  {excerpt && <p className="mt-0.5 line-clamp-2 border-l-2 border-white/15 pl-2 text-xs italic text-slate-400">“{excerpt}”</p>}
                </div>
                <Timestamp iso={entry.created_at} className="shrink-0 text-[11px] text-slate-500" />
              </li>
            );
          })}
        </ol>
      )}
      {loading && entries.length === 0 && (
        <div className="flex justify-center py-6 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-label="Loading audit log" />
        </div>
      )}
      {hasMore && (
        <Button variant="secondary" size="sm" loading={loading} onClick={() => void load(entries.at(-1)?.id)}>
          Load more
        </Button>
      )}
    </div>
  );
}
