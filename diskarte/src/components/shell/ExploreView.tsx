"use client";

import { Compass, Loader2, Menu as MenuIcon, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { joinPublicServerAction } from "@/actions/servers";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { HomeSidebar } from "@/components/social/HomeSidebar";
import { Button } from "@/components/ui/Button";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { SERVER_CATEGORIES, type Server } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { ServerIcon } from "./ServerIcon";
import { useShellUI } from "./ShellUI";

type Listing = { id: string; name: string; description: string; icon_url: string | null; category: string; member_count: number; active_members: number; is_member: boolean };

/** Explore: browse and search servers whose admins listed them, and join without an invite. */
export function ExploreView({ servers }: { servers: Server[] }) {
  const supabase = useSupabase();
  const router = useRouter();
  const { setNavOpen } = useShellUI();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<Listing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        void supabase.rpc("discover_servers", { p_query: query.trim(), p_category: category, p_limit: 48 }).then(({ data, error }) => {
          if (!live) return;
          setFailed(!!error);
          setResults((data as Listing[] | null) ?? []);
        }),
      query ? 300 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [supabase, query, category]);

  async function join(listing: Listing) {
    if (listing.is_member) return router.push(`/tambayan/${listing.id}`);
    setJoining(listing.id);
    const result = await joinPublicServerAction({ serverId: listing.id });
    setJoining(null);
    if (!result.ok) return void toast.error(result.error ?? "Couldn't join.");
    toast.success(`Welcome to ${listing.name}!`);
    router.push(`/tambayan/${listing.id}`);
  }

  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Explore">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <Compass className="size-5 text-sun" aria-hidden />
            <h1 className="font-bold text-white">Explore</h1>
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-4 py-6">
              <p className="text-2xl font-extrabold text-white">Find your tambayan</p>
              <p className="mt-1 text-sm text-slate-400">Communities that chose to be listed. Join one, no invite needed.</p>
              <label className="relative mt-4 block">
                <span className="sr-only">Search servers</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search servers"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-[15px] text-white outline-none focus:border-sun/60"
                />
              </label>
              <div className="scrollbar-none -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Category">
                {[{ id: null, label: "All" }, ...SERVER_CATEGORIES].map((c) => (
                  <button
                    key={c.id ?? "all"}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className={cn("min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors", category === c.id ? "border-sun/70 bg-sun/15 text-sun" : "border-white/10 text-slate-300 hover:border-white/25")}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {results === null ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/5" />
                  ))}
                </div>
              ) : failed ? (
                <p className="mt-10 text-center text-sm text-slate-400">Explore isn&apos;t available right now.</p>
              ) : results.length === 0 ? (
                <p className="mt-10 text-center text-sm text-slate-400">{query || category ? "No servers match." : "No servers are listed yet. Admins can list theirs in Server settings → Show in Explore."}</p>
              ) : (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="explore-results">
                  {results.map((s) => (
                    <li key={s.id} className="glass flex flex-col rounded-2xl p-4">
                      <div className="flex items-center gap-3">
                        <ServerIcon server={{ id: s.id, name: s.name, icon_url: s.icon_url } as Server} size={48} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-white">{s.name}</p>
                          <p className="text-xs text-slate-400">{SERVER_CATEGORIES.find((c) => c.id === s.category)?.label ?? "Other"}</p>
                        </div>
                      </div>
                      {s.description && <p className="mt-2 line-clamp-2 text-sm text-slate-300">{s.description}</p>}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Users className="size-3.5" aria-hidden /> {s.member_count} member{s.member_count === 1 ? "" : "s"}
                          {s.active_members > 0 && <span className="text-emerald-300"> · {s.active_members} active this week</span>}
                        </span>
                        <Button size="sm" variant={s.is_member ? "secondary" : "primary"} onClick={() => void join(s)} disabled={joining !== null} aria-label={`${s.is_member ? "Open" : "Join"} ${s.name}`}>
                          {joining === s.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : s.is_member ? "Open" : "Join"}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </WorkspacePanel>
    </>
  );
}
