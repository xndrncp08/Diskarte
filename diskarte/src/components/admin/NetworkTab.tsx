"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, Headphones, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import {
  DEFAULT_FILTERS,
  filterUsers,
  isBanned,
  PLATFORM_ROLE_LABEL,
  PLATFORM_ROLES,
  PRESENCE_LABEL,
  PRESENCE_STATES,
  presenceOf,
  type AdminSnapshot,
  type AdminUser,
  type RosterFilters,
} from "@/lib/admin";
import { cn } from "@/lib/utils";
import { CountUp } from "./CountUp";
import { formatAgo } from "./format";
import { PresencePill, RoleBadge, SectionLabel, SELECT } from "./primitives";
import { UserInspector } from "./UserInspector";

function Stats({ snapshot }: { snapshot: AdminSnapshot }) {
  const o = snapshot.overview;
  const max = Math.max(1, ...o.last7.map((d) => d.count));
  const cards = [
    { label: "Users", value: o.users, tone: "text-white" },
    { label: "Online", value: o.online, tone: "text-signal-green" },
    { label: "In voice", value: Math.max(o.in_voice, new Set(snapshot.voice.rooms.flatMap((r) => r.participants.map((p) => p.identity))).size), tone: "text-neon" },
    { label: "Banned", value: o.banned, tone: "text-signal-dnd" },
  ];
  return (
    <section aria-label="Network telemetry" className="grid grid-cols-2 gap-2 @md:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5" data-testid={`stat-${c.label.toLowerCase().replace(/\s/g, "-")}`}>
          <p className="font-silk text-[10px] uppercase tracking-wider text-slate-400">{c.label}</p>
          <CountUp value={c.value} className={cn("mt-1 block font-pixel text-base", c.tone)} />
        </div>
      ))}
      <div className="col-span-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="font-silk text-[10px] uppercase tracking-wider text-slate-400">Sign-ups · 7 days</p>
        <div className="mt-1.5 flex h-12 items-end gap-1.5" role="img" aria-label={o.last7.map((d) => `${d.day}: ${d.count}`).join(", ")}>
          {o.last7.map((d) => (
            <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
              <div className="w-full bg-sun/80" style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} title={`${d.day}: ${d.count}`} />
              <span className="text-[9px] tabular-nums text-slate-500">{String(d.day).slice(8, 10)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Filters({ filters, setFilters, snapshot, shown }: { filters: RosterFilters; setFilters: (f: RosterFilters) => void; snapshot: AdminSnapshot; shown: number }) {
  const set = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) => setFilters({ ...filters, [key]: value });
  const rooms = snapshot.voice.rooms.filter((r) => r.channelId);
  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">Search users</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set("query", e.target.value)}
          placeholder="Search username, name or email"
          className="h-9 w-full rounded-xl border border-white/10 bg-black/40 pl-8 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sun/70 focus:ring-2 focus:ring-sun/20 pointer-coarse:h-11"
          data-testid="roster-search"
        />
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <select aria-label="Filter by presence" className={SELECT} value={filters.presence} onChange={(e) => set("presence", e.target.value as RosterFilters["presence"])}>
          <option value="all">Any presence</option>
          {PRESENCE_STATES.map((p) => (
            <option key={p} value={p}>
              {PRESENCE_LABEL[p]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by role" className={SELECT} value={filters.role} onChange={(e) => set("role", e.target.value as RosterFilters["role"])}>
          <option value="all">Any role</option>
          {PLATFORM_ROLES.map((r) => (
            <option key={r} value={r}>
              {PLATFORM_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <select aria-label="Filter by account status" className={SELECT} value={filters.account} onChange={(e) => set("account", e.target.value as RosterFilters["account"])}>
          <option value="all">Any account</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
        </select>
        <select aria-label="Filter by channel participation" className={SELECT} value={filters.channel} onChange={(e) => set("channel", e.target.value)}>
          <option value="any">Any channel</option>
          <option value="voice">In a voice stage</option>
          <option value="none">Not in voice</option>
          {rooms.map((r) => (
            <option key={r.room} value={r.channelId!}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs tabular-nums text-slate-500" aria-live="polite">
          {shown.toLocaleString("en-PH")} / {snapshot.users.length.toLocaleString("en-PH")}
        </span>
      </div>
    </div>
  );
}

function Row({ user, now, inStage, onOpen }: { user: AdminUser; now: number; inStage: boolean; onOpen: () => void }) {
  const p = presenceOf(user, now);
  const banned = isBanned(user, now);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] @md:grid-cols-[minmax(0,1fr)_9.5rem_6.5rem_4.5rem]"
        data-testid="roster-row"
        data-user={user.username}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <UserAvatar profile={user} size={28} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-white">{user.display_name}</span>
              {banned && <Ban className="size-3.5 shrink-0 text-signal-dnd" aria-label="Banned" />}
              {inStage && <Headphones className="size-3.5 shrink-0 text-neon" aria-label="On a voice stage" />}
            </span>
            <span className="block truncate text-xs text-slate-500">@{user.username}</span>
          </span>
        </span>
        <PresencePill state={p.state} invisible={p.invisible} className="@max-md:hidden" />
        <RoleBadge role={user.role} className="justify-self-start" />
        <span className="text-right text-xs tabular-nums text-slate-500 @max-md:hidden" title="Last active">
          {formatAgo(user.last_seen_at, now)}
        </span>
      </button>
    </li>
  );
}

/** Network roster + real-time presence inspector. */
export function NetworkTab({ snapshot, now, query, setQuery, onChanged }: { snapshot: AdminSnapshot; now: number; query: string; setQuery: (q: string) => void; onChanged: () => void }) {
  const [filters, setFiltersState] = useState<RosterFilters>({ ...DEFAULT_FILTERS, query });
  const [selected, setSelected] = useState<string | null>(null);
  const inLiveKit = useMemo(() => new Set(snapshot.voice.rooms.flatMap((r) => r.participants.map((p) => p.identity))), [snapshot.voice.rooms]);
  const users = useMemo(() => filterUsers(snapshot.users, filters, now, inLiveKit), [snapshot.users, filters, now, inLiveKit]);
  const user = selected ? snapshot.users.find((u) => u.id === selected) : undefined;

  const setFilters = (f: RosterFilters) => {
    setFiltersState(f);
    // The search box also narrows the server-side roster (debounced in useAdminSnapshot).
    if (f.query !== filters.query) setQuery(f.query);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-hidden={!!user || undefined} inert={!!user || undefined}>
        <Stats snapshot={snapshot} />
        <section aria-labelledby="roster-heading" className="space-y-2">
          <SectionLabel id="roster-heading" className="flex items-center gap-1.5">
            <Users className="size-3.5" aria-hidden /> Network roster
          </SectionLabel>
          <Filters filters={filters} setFilters={setFilters} snapshot={snapshot} shown={users.length} />
          {users.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-400">No one matches these filters.</p>
          ) : (
            <ul className="space-y-0.5" aria-label="Users">
              {users.map((u) => (
                <Row key={u.id} user={u} now={now} inStage={inLiveKit.has(u.id)} onOpen={() => setSelected(u.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>
      <AnimatePresence>
        {user && (
          <motion.div
            key={user.id}
            className="absolute inset-0 z-10 flex min-h-0 flex-col bg-[#0b1020]/[0.97] backdrop-blur-xl"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <UserInspector user={user} snapshot={snapshot} now={now} onClose={() => setSelected(null)} onChanged={onChanged} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
