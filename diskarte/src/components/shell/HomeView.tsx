"use client";

import Link from "next/link";
import { Compass, Menu as MenuIcon, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { useMe } from "@/components/providers/MeProvider";
import { HomeSidebar } from "@/components/social/HomeSidebar";
import type { Server } from "@/lib/servers";
import { AddServerDialog } from "./AddServerDialog";
import { ServerIcon } from "./ServerIcon";
import { useShellUI } from "./ShellUI";

export function HomeView({ servers }: { servers: Server[] }) {
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);

  return (
    <>
      <HomeSidebar servers={servers} />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3 md:hidden">
          <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10">
            <MenuIcon className="size-5" aria-hidden />
          </button>
          <span className="font-bold text-white">Home</span>
        </header>
        <div className="mx-auto w-full max-w-4xl px-5 py-10">
          <div className="flex items-center gap-4">
            <DiskarteLogo size={72} variant="mascot" />
            <div>
              <p className="font-pixel text-[10px] text-sun">PLAYER 1 READY</p>
              <h1 className="mt-2 text-3xl font-extrabold text-white">Mabuhay, {me.display_name}!</h1>
              <p className="text-slate-400">Where are we hanging out today?</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <button type="button" onClick={() => setDialog("create")} className="glass group rounded-2xl p-5 text-left transition-colors hover:border-sun/40">
              <Sparkles className="mb-3 size-6 text-sun" aria-hidden />
              <p className="font-bold text-white">Create a server</p>
              <p className="text-sm text-slate-400">Your own space for friends, a class or a guild.</p>
            </button>
            <button type="button" onClick={() => setDialog("join")} className="glass group rounded-2xl p-5 text-left transition-colors hover:border-sun/40">
              <Compass className="mb-3 size-6 text-sky-300" aria-hidden />
              <p className="font-bold text-white">Join with an invite</p>
              <p className="text-sm text-slate-400">Got a link from a friend? Paste it here.</p>
            </button>
            <Link href="/tambayan/friends" className="glass group rounded-2xl p-5 text-left transition-colors hover:border-sun/40">
              <Users className="mb-3 size-6 text-emerald-300" aria-hidden />
              <p className="font-bold text-white">Add friends</p>
              <p className="text-sm text-slate-400">Find friends by @username and start a DM.</p>
            </Link>
          </div>

          {servers.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 font-pixel text-[10px] text-slate-400">SAVED GAMES</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {servers.map((s) => (
                  <li key={s.id}>
                    <Link href={`/tambayan/${s.id}`} className="glass group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white/10">
                      <ServerIcon server={s} size={44} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-white">{s.name}</span>
                        <span className="block truncate text-xs text-slate-400">{s.description || "Server"}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <AddServerDialog key={dialog ?? "closed"} open={dialog !== null} onClose={() => setDialog(null)} initialTab={dialog ?? "create"} />
    </>
  );
}
