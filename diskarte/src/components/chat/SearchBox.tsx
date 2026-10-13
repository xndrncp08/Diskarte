"use client";

import { Hash, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Timestamp } from "@/components/chat/Timestamp";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { parseSearch } from "@/lib/search";
import type { Tables } from "@/lib/supabase/database.types";

type Hit = Tables<"messages">;
const PAGE = 25;

/**
 * Discord's search box: words, `from:username`, `in:channel`. Results list newest first in a panel
 * over the chat; clicking one opens its channel. Only messages you're allowed to read come back.
 */
export function SearchBox() {
  const supabase = useSupabase();
  const router = useRouter();
  const { server, members, channels } = useServer();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const asked = useRef<{ text: string; author: string | null; channel: string | null } | null>(null);


  async function run(before: string | null) {
    const a = asked.current;
    if (!a) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("search_messages", { p_server: server.id, p_query: a.text, p_author: a.author, p_channel: a.channel, p_before: before, p_limit: PAGE });
    setLoading(false);
    if (error) {
      setProblem("Search isn't available right now.");
      return;
    }
    setHits((prev) => (before ? [...(prev ?? []), ...(data ?? [])] : (data ?? [])));
    setMore((data?.length ?? 0) === PAGE);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSearch(query);
    setProblem(null);
    const author = parsed.from ? members.find((m) => m.profile.username === parsed.from || (m.nickname ?? "").toLowerCase() === parsed.from)?.user_id : null;
    const channel = parsed.in ? channels.find((c) => c.name.toLowerCase() === parsed.in)?.id : null;
    if (parsed.from && !author) return setProblem(`Nobody here goes by "${parsed.from}".`), setHits([]);
    if (parsed.in && !channel) return setProblem(`There's no #${parsed.in} here.`), setHits([]);
    if (!parsed.text && !author && !channel) return;
    asked.current = { text: parsed.text, author: author ?? null, channel: channel ?? null };
    setHits(null);
    void run(null);
  }

  function close() {
    asked.current = null;
    setHits(null);
    setProblem(null);
  }

  const open = hits !== null || loading || problem !== null;
  // Results open over the main column (the channel view), like Discord's search pane. Only after a
  // search, so this never runs during server rendering.
  const panel = open ? document.getElementById("main-content") : null;
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "channel";

  return (
    <>
      <form onSubmit={submit} role="search" className="relative hidden sm:block">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label={`Search ${server.name} (from:name, in:channel)`}
          className="h-7 w-36 rounded-md border border-white/10 bg-black/40 pl-7 pr-2 text-xs text-slate-100 outline-none transition-[width] focus:w-56 focus:border-sun/60"
        />
      </form>
      {open &&
        panel &&
        createPortal(
          <section aria-label="Search results" className="absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-white/10 bg-midnight shadow-2xl shadow-black/60" data-testid="search-results">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-3">
              <p className="flex-1 text-sm font-semibold text-white">{hits ? `${hits.length}${more ? "+" : ""} result${hits.length === 1 ? "" : "s"}` : "Searching…"}</p>
              <button type="button" onClick={close} aria-label="Close search" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                <X className="size-4" aria-hidden />
              </button>
            </header>
            <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {problem && <p className="text-sm text-amber-200">{problem}</p>}
              {hits?.length === 0 && !problem && <p className="py-8 text-center text-sm text-slate-400">No results. Try fewer words.</p>}
              {hits?.map((m) => {
                const who = m.author_id ? byId.get(m.author_id) : undefined;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      close();
                      router.push(`/tambayan/${server.id}/${m.channel_id}`);
                    }}
                    className="block w-full rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-left hover:border-white/15 hover:bg-white/[0.06]"
                    data-testid="search-hit"
                  >
                    <span className="mb-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <Hash className="size-3" aria-hidden />
                      {channelName(m.channel_id)}
                    </span>
                    <span className="flex items-start gap-2">
                      {who && <UserAvatar profile={who.profile} size={28} />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-sm font-semibold text-white">{who ? (who.nickname ?? who.profile.display_name) : "Someone"}</span>
                          <Timestamp iso={m.created_at} className="shrink-0 text-[11px] text-slate-500" />
                        </span>
                        <span className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-300">{m.content || "(attachment)"}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {loading && <Loader2 className="mx-auto size-5 animate-spin text-slate-500" aria-label="Loading" />}
              {more && !loading && hits && (
                <button type="button" onClick={() => void run(hits.at(-1)!.created_at)} className="w-full rounded-lg py-2 text-sm font-semibold text-sun hover:bg-white/5">
                  Load more
                </button>
              )}
            </div>
          </section>,
          panel,
        )}
    </>
  );
}
