"use client";

import Link from "next/link";
import { Menu as MenuIcon, Search, Users } from "lucide-react";
import { useState } from "react";
import { useShellUI } from "@/components/shell/ShellUI";
import { useSocial } from "@/components/providers/SocialProvider";
import { conversationTitle } from "@/lib/social";
import type { Server } from "@/lib/servers";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { DmRow, HomeSidebar } from "./HomeSidebar";

/** The Messages tab: every DM and group DM, full screen on phones, searchable. */
export function MessagesView({ servers }: { servers: Server[] }) {
  const { conversations, friends } = useSocial();
  const { setNavOpen } = useShellUI();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = (conversations ?? []).filter((c) => !q || conversationTitle(c).toLowerCase().includes(q));
  const incoming = friends?.filter((f) => f.status === "incoming").length ?? 0;

  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Messages">
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            <h1 className="font-bold text-white">Messages</h1>
          </header>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <label className="relative mb-3 block">
              <span className="sr-only">Search conversations</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a conversation"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-[15px] text-white outline-none focus:border-sun/60"
              />
            </label>
            <Link href="/tambayan/friends" className="mb-2 flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold text-slate-200 hover:bg-white/5">
              <Users className="size-5" aria-hidden /> Friends
              {incoming > 0 && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] text-white">{incoming}<span className="sr-only"> pending requests</span></span>}
            </Link>
            <ul className="space-y-0.5" data-testid="messages-list">
              {conversations === null
                ? [0, 1, 2, 3].map((i) => <li key={i} className="mx-2 h-12 animate-pulse rounded-xl bg-white/5" />)
                : list.length === 0
                  ? <li className="px-2 py-8 text-center text-sm text-slate-400">{q ? "No conversations match." : "No messages yet. Add a friend to start one."}</li>
                  : list.map((c) => <DmRow key={c.id} conversation={c} active={false} />)}
            </ul>
          </div>
        </section>
      </WorkspacePanel>
    </>
  );
}
