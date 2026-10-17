"use client";

import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { HomeSidebar } from "@/components/social/HomeSidebar";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { Button } from "@/components/ui/Button";
import { Timestamp } from "@/components/chat/Timestamp";
import type { Database } from "@/lib/supabase/database.types";
import type { Server } from "@/lib/servers";
import { useShellUI } from "./ShellUI";

type Hit = Database["public"]["Functions"]["search_all_messages"]["Returns"][number];

export function GlobalSearchView({ servers }: { servers: Server[] }) {
  const supabase = useSupabase();
  const { setNavOpen } = useShellUI();
  const [query, setQuery] = useState("");
  const [server, setServer] = useState("");
  const [sender, setSender] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [kind, setKind] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState("");
  const request = useRef(0);
  const asked = useRef<Database["public"]["Functions"]["search_all_messages"]["Args"] | null>(null);
  const page = async (args: NonNullable<typeof asked.current>, append = false) => {
    const generation = ++request.current;
    setLoading(true); setProblem("");
    try {
      const { data, error } = await supabase.rpc("search_all_messages", args);
      if (generation !== request.current) return;
      if (error) throw error;
      setHits((prev) => append ? [...(prev ?? []), ...(data ?? [])] : data ?? []);
      setMore(data?.length === 25);
    } catch { if (generation === request.current) setProblem("Search couldn’t load. Try again."); }
    finally { if (generation === request.current) setLoading(false); }
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    const generation = ++request.current;
    setLoading(false);
    setProblem("");
    if (!query.trim() && !server && !sender && !after && !before && !kind) return setProblem("Enter some words or choose a filter.");
    if (after && before && after >= before) return setProblem("The end date must be after the start date.");
    let author: string | null = null;
    if (sender.trim()) {
      const { data, error } = await supabase.from("profiles").select("id").eq("username", sender.trim().replace(/^@/, "").toLowerCase()).maybeSingle();
      if (generation !== request.current) return;
      if (error) return setProblem("The sender couldn’t be checked. Try again.");
      if (!data) return setProblem("That username couldn’t be found.");
      author = data.id;
    }
    asked.current = { p_query: query.trim().slice(0, 500), p_server: server || null, p_author: author, p_after: after ? new Date(`${after}T00:00:00Z`).toISOString() : null, p_before: before ? new Date(`${before}T00:00:00Z`).toISOString() : null, p_kind: kind || null, p_limit: 25 };
    setHits(null); void page(asked.current);
  }
  const field = "min-h-11 min-w-0 rounded-lg border border-white/15 bg-midnight px-3 text-base text-slate-100 outline-none focus:border-sun";
  return <><HomeSidebar servers={servers} /><WorkspacePanel id="main" title="Search">
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="page-header"><button type="button" aria-label="Open navigation" onClick={() => setNavOpen(true)} className="flex size-11 items-center justify-center md:hidden"><Menu className="size-5" /></button><Search className="size-5 text-sun" aria-hidden /><h1 className="font-semibold">Search</h1></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form onSubmit={(event) => void submit(event)} className="mx-auto max-w-3xl space-y-3" role="search">
          <label className="block text-sm">Messages across your conversations<input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={500} className={`${field} mt-1 w-full`} placeholder="Search words…" /></label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-slate-300">Community<select value={server} onChange={(e) => setServer(e.target.value)} className={field}><option value="">All communities and DMs</option>{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">Sender username<input value={sender} onChange={(e) => setSender(e.target.value)} maxLength={32} placeholder="@username" className={field} /></label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">Media<select value={kind} onChange={(e) => setKind(e.target.value)} className={field}><option value="">Any message</option><option value="attachment">Attachments</option><option value="image">Images</option><option value="audio">Audio</option><option value="video">Video</option></select></label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">From date (UTC)<input type="date" value={after} onChange={(e) => setAfter(e.target.value)} className={field} /></label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">Before date (UTC)<input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className={field} /></label>
          </div>
          <Button type="submit" loading={loading}>Search</Button>
        </form>
        <div className="mx-auto mt-5 max-w-3xl" aria-live="polite">
          {problem && <p role="alert" className="mb-3 text-sm text-amber-200">{problem}</p>}
          {hits?.length === 0 && <p className="text-sm text-slate-400">No permitted messages match these filters.</p>}
          {hits && <ul className="space-y-2" aria-label="Search results">{hits.map((hit) => <li key={`${hit.source}:${hit.id}`}><Link href={hit.source === "dm" ? `/tambayan/dm/${hit.conversation_id}?message=${hit.id}` : `/tambayan/${hit.server_id}/${hit.channel_id}?message=${hit.id}`} className="glass block rounded-xl p-3 hover:border-sun/40">
            <span className="flex items-center justify-between gap-2 text-xs text-slate-400"><span>{hit.source === "dm" ? "Direct message" : servers.find((s) => s.id === hit.server_id)?.name ?? "Community"}{hit.thread_id ? " · Thread" : ""}</span><Timestamp iso={hit.created_at} /></span>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm">{hit.content || "Attachment"}</p><span className="mt-2 block text-xs text-sun">Open message in context</span>
          </Link></li>)}</ul>}
          {more && hits?.length && <Button className="mt-4" variant="secondary" loading={loading} onClick={() => { const last = hits.at(-1)!; if (asked.current) void page({ ...asked.current, p_cursor_date: last.created_at, p_cursor_id: last.id }, true); }}>Load more</Button>}
        </div>
      </div>
    </section>
  </WorkspacePanel></>;
}
