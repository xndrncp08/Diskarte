"use client";

import Link from "next/link";
import { Compass, Menu as MenuIcon, Sparkles } from "lucide-react";
import { useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { CallDock } from "@/components/voice/CallDock";
import { useMe } from "@/components/providers/MeProvider";
import type { Server } from "@/lib/servers";
import { AddServerDialog } from "./AddServerDialog";
import { DrawerPanel } from "./AppShell";
import { ServerIcon } from "./ServerIcon";
import { useShellUI } from "./ShellUI";
import { UserPanel } from "./UserPanel";

export function HomeView({ servers }: { servers: Server[] }) {
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);

  return (
    <>
      <DrawerPanel>
        <aside aria-label="Home" className="glass flex h-full w-60 flex-col border-y-0 border-l-0">
          <div className="flex h-12 items-center border-b border-white/5 px-4 font-bold text-white">Home</div>
          <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
            <p className="mb-1 px-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Mga tambayan mo</p>
            <ul className="space-y-0.5">
              {servers.map((s) => (
                <li key={s.id}>
                  <Link href={`/tambayan/${s.id}`} onClick={() => setNavOpen(false)} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                    <ServerIcon server={s} size={28} />
                    <span className="truncate">{s.name}</span>
                  </Link>
                </li>
              ))}
              {servers.length === 0 && <li className="px-2 text-sm text-slate-500">Wala pa. Gumawa o sumali!</li>}
            </ul>
          </nav>
          <CallDock />
          <UserPanel />
        </aside>
      </DrawerPanel>

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
              <p className="text-slate-400">Saan tayo tatambay ngayon?</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => setDialog("create")} className="glass group rounded-2xl p-5 text-left transition-colors hover:border-sun/40">
              <Sparkles className="mb-3 size-6 text-sun" aria-hidden />
              <p className="font-bold text-white">Gumawa ng Tambayan</p>
              <p className="text-sm text-slate-400">Sariling server para sa barkada, klase o guild.</p>
            </button>
            <button type="button" onClick={() => setDialog("join")} className="glass group rounded-2xl p-5 text-left transition-colors hover:border-sun/40">
              <Compass className="mb-3 size-6 text-sky-300" aria-hidden />
              <p className="font-bold text-white">Sumali gamit ang invite</p>
              <p className="text-sm text-slate-400">May link ka galing sa tropa? I-paste mo dito.</p>
            </button>
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
                        <span className="block truncate text-xs text-slate-400">{s.description || "Tambayan"}</span>
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
