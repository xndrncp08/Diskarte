"use client";

import { Compass, Users } from "lucide-react";
import { useOptionalRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { communityAccent, communityBanner } from "@/lib/community-identity";
import { SERVER_CATEGORIES } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { Monogram } from "../Avatar";
import { Button } from "../Button";
import { Chip } from "../Chip";
import { Input } from "../Field";
import { PulseSurface } from "../PulseSurface";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { Masthead } from "../shell/Masthead";

/** One discover_servers row (banner/accent only once migration 20261109010000 is applied). */
export type Listing = { id: string; name: string; description: string; icon_url: string | null; category: string; member_count: number; active_members: number; is_member: boolean; banner_url?: string | null; accent_color?: string | null };

const CATEGORIES = [{ value: "all", label: "All" }, ...SERVER_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))];

/**
 * Explore in Pulse: an editorial masthead, the search and category filter, then communities as cards (the first one
 * featured two columns wide). Only what discover_servers returns is shown; ExploreView owns the query, paging and the
 * join flow (membership screening included), so both shells behave the same.
 */
export function PulseExplore({ query, onQuery, category, onCategory, results, failed, loading, more, onMore, onRetry, joining, onJoin }: {
  query: string; onQuery: (value: string) => void; category: string | null; onCategory: (value: string | null) => void; results: Listing[] | null; failed: boolean; loading: boolean;
  more: boolean; onMore: () => void; onRetry: () => void; joining: string | null; onJoin: (listing: Listing) => void;
}) {
  const config = useOptionalRuntimeConfig();
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text">
      <Masthead eyebrow="Discover" title="Explore" icon={<Compass />} description="Communities that chose to be listed" />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
          {/* Phones already have the masthead; the editorial headline would push the communities below the fold. */}
          <p className="max-w-2xl font-pulse-display text-pulse-hero font-semibold max-md:hidden">Find your tambayan</p>
          <p className="mt-2 max-w-xl text-pulse-lead text-pulse-muted max-md:hidden">Gaming crews, study groups, creators and more. Join one, no invite needed.</p>
          <div className="flex flex-col gap-3 md:mt-5">
            <Input label="Search communities" type="search" value={query} onChange={(e) => onQuery(e.target.value)} maxLength={500} placeholder="Name or topic" wrapperClassName="md:max-w-md" />
            {/* Single-select toggle chips that wrap, so no category is cut off. */}
            <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => <Chip key={c.value} selected={(category ?? "all") === c.value} onClick={() => onCategory(c.value === "all" ? null : c.value)}>{c.label}</Chip>)}
            </div>
          </div>
          {failed && <ErrorState title="Explore couldn't load" onRetry={onRetry} retrying={loading} className="mt-6">Check your connection and try again.</ErrorState>}
          {results === null && !failed ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading communities">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className={cn("h-44 rounded-pulse-card", i === 0 && "sm:col-span-2")} />)}
            </div>
          ) : results?.length === 0 && !failed ? (
            <EmptyState title={query || category ? "No communities match" : "Nothing listed yet"} icon={<Compass />} headingLevel={2} className="mt-6">
              {query || category ? "Try another word or category." : "Admins can list theirs in Server settings → Show in Explore."}
            </EmptyState>
          ) : (
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="explore-results" aria-label="Communities">
              {results?.map((s, i) => {
                const banner = communityBanner(s.banner_url, config?.supabaseUrl);
                const accent = communityAccent(s.accent_color);
                return (
                  <li key={s.id} className={cn(i === 0 && results.length > 2 && "sm:col-span-2")}>
                    <PulseSurface className="flex h-full flex-col overflow-hidden">
                      {banner ? (
                        // eslint-disable-next-line @next/next/no-img-element -- allow-listed storage URL, decorative
                        <img src={banner} alt="" className="h-24 w-full object-cover" referrerPolicy="no-referrer" />
                      ) : accent ? <div className="h-3" style={{ background: accent.background }} aria-hidden /> : null}
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        <div className="flex items-center gap-3">
                          <Monogram name={s.name} src={s.icon_url} size={48} />
                          <div className="min-w-0">
                            <h2 className="truncate font-pulse-display text-pulse-title font-semibold">{s.name}</h2>
                            <Chip className="mt-1">{SERVER_CATEGORIES.find((c) => c.id === s.category)?.label ?? "Other"}</Chip>
                          </div>
                        </div>
                        {s.description && <p className="line-clamp-2 text-pulse-body text-pulse-muted">{s.description}</p>}
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-pulse-label text-pulse-muted">
                            <Users className="size-4" aria-hidden />
                            {s.member_count} member{s.member_count === 1 ? "" : "s"}
                            {s.active_members > 0 && ` · ${s.active_members} active this week`}
                          </span>
                          <Button size="sm" variant={s.is_member ? "quiet" : "secondary"} loading={joining === s.id} disabled={joining !== null && joining !== s.id} onClick={() => onJoin(s)} aria-label={`${s.is_member ? "Open" : "Join"} ${s.name}`}>
                            {s.is_member ? "Open" : "Join"}
                          </Button>
                        </div>
                      </div>
                    </PulseSurface>
                  </li>
                );
              })}
            </ul>
          )}
          {more && !failed && <Button className="mt-5" loading={loading} onClick={onMore}>Load more communities</Button>}
        </div>
      </div>
    </section>
  );
}
