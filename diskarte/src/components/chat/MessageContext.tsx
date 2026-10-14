"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { Button } from "@/components/ui/Button";
import { parseAttachments, olderThan } from "@/lib/messages";
import { uuidSchema } from "@/lib/schemas/servers";
import type { Json } from "@/lib/supabase/database.types";
import { MessageMarkdown } from "./MessageMarkdown";
import { Timestamp } from "./Timestamp";
import { Attachments } from "./Attachments";

type ContextRow = { id: string; content: string; author_id: string | null; created_at: string; attachments?: Json };

/** An exact, permission-checked historical excerpt. Loading it never creates a gap in live history. */
export function MessageContext({ channelId, conversationId }: { channelId?: string; conversationId?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const target = params.get("message");
  const supabase = useSupabase();
  const [rows, setRows] = useState<ContextRow[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!target) return;
    let live = true;
    const load = async () => {
      setRows(null); setProblem("");
      if (!uuidSchema.safeParse(target).success) return setProblem("This message link is invalid.");
      try {
        let result: ContextRow[];
        if (channelId) {
          const { data: anchor, error } = await supabase.from("messages").select("id,content,author_id,created_at,attachments,thread_id").eq("id", target).eq("channel_id", channelId).maybeSingle();
          if (error) throw error;
          if (!anchor) { if (live) setProblem("This message was deleted or you no longer have access."); return; }
          const query = () => {
            const q = supabase.from("messages").select("id,content,author_id,created_at,attachments").eq("channel_id", channelId);
            return anchor.thread_id ? q.eq("thread_id", anchor.thread_id) : q.is("thread_id", null);
          };
          const [older, newer] = await Promise.all([
            query().or(olderThan(anchor)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10),
            query().or(`created_at.gt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.gt.${anchor.id})`).order("created_at").order("id").limit(10),
          ]);
          if (older.error || newer.error) throw older.error ?? newer.error;
          result = [...(older.data ?? []).reverse(), anchor, ...(newer.data ?? [])];
        } else if (conversationId) {
          const query = () => supabase.from("direct_messages").select("id,content,author_id,created_at").eq("conversation_id", conversationId);
          const { data: anchor, error } = await query().eq("id", target).maybeSingle();
          if (error) throw error;
          if (!anchor) { if (live) setProblem("This message was deleted or you no longer have access."); return; }
          const [older, newer] = await Promise.all([
            query().or(olderThan(anchor)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10),
            query().or(`created_at.gt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.gt.${anchor.id})`).order("created_at").order("id").limit(10),
          ]);
          if (older.error || newer.error) throw older.error ?? newer.error;
          result = [...(older.data ?? []).reverse(), anchor, ...(newer.data ?? [])];
        } else return;
        const ids = [...new Set(result.flatMap((m) => m.author_id ? [m.author_id] : []))];
        const { data: authors } = ids.length ? await supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
        if (live) { setNames(Object.fromEntries((authors ?? []).map((p) => [p.id, p.display_name]))); setRows(result); }
      } catch { if (live) setProblem("Message context couldn’t load. Try again."); }
    };
    void load();
    return () => { live = false; };
  }, [target, channelId, conversationId, supabase, attempt]);
  const close = () => {
    const next = new URLSearchParams(params.toString()); next.delete("message");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return target && <FloatingWindow id="message-context" open title="Message in context" onClose={close} className="h-[min(44rem,90dvh)] w-[min(44rem,95vw)]">
    {problem ? <div role="status" className="space-y-3"><p>{problem}</p><Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button></div> : !rows ? <p role="status">Loading message…</p> : <ol className="space-y-3" aria-label="Message context">{rows.map((row) => <li key={row.id} tabIndex={row.id === target ? -1 : undefined} data-autofocus={row.id === target ? "" : undefined} className={`rounded-xl p-3 outline-none ${row.id === target ? "bg-sun/10 ring-2 ring-sun/60" : "bg-white/[0.03]"}`}>
      <div className="mb-1 flex items-baseline gap-2"><span className="text-sm font-semibold">{row.author_id ? names[row.author_id] ?? "Member" : "Deleted user"}</span><Timestamp iso={row.created_at} className="text-xs text-slate-400" />{row.id === target && <span className="sr-only">Selected message</span>}</div>
      {row.content && <MessageMarkdown content={row.content} />}<Attachments attachments={parseAttachments(row.attachments)} />
    </li>)}</ol>}
    <Button variant="secondary" className="mt-4" onClick={close}>Return to conversation</Button>
  </FloatingWindow>;
}
