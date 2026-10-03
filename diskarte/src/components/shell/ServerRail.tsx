"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, Plus } from "lucide-react";
import { useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Server } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { AddServerDialog } from "./AddServerDialog";
import { ServerIcon } from "./ServerIcon";

function Pill({ active }: { active: boolean }) {
  return (
    <span className="absolute -left-3 top-1/2 flex h-10 w-1 -translate-y-1/2 items-center" aria-hidden>
      {active ? (
        <motion.span layoutId="rail-pill" className="h-10 w-1 rounded-r bg-sun" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
      ) : (
        <span className="h-0 w-1 rounded-r bg-white transition-[height] duration-150 group-hover:h-5" />
      )}
    </span>
  );
}

export function ServerRail({ servers }: { servers: Server[] }) {
  const params = useParams<{ serverId?: string }>();
  const activeId = params.serverId;
  const [adding, setAdding] = useState(false);
  const attention = useOptionalSocial()?.attention ?? 0;
  // Diskarte HQ, the global server everyone belongs to, is pinned first with a gold ring.
  const hq = servers.find((s) => s.is_system);
  const others = servers.filter((s) => !s.is_system);

  return (
    <nav
      aria-label="Servers"
      className="pt-safe flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto pb-3 scrollbar-none max-md:bg-abyss md:h-auto md:max-h-full md:rounded-[2rem] md:py-3 md:float-card"
      data-testid="micro-dock"
    >
      <Tooltip label="Home">
        <Link href="/tambayan" aria-label={attention ? `Home (${attention} new)` : "Home"} aria-current={!activeId ? "page" : undefined} className="group relative flex">
          <Pill active={!activeId} />
          <span className={cn("flex size-12 items-center justify-center bg-midnight transition-[border-radius,background-color] duration-200", !activeId ? "rounded-2xl bg-sun/15" : "rounded-[50%] group-hover:rounded-2xl")}>
            <DiskarteLogo size={40} title="Diskarte home" />
          </span>
          {attention > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full border-2 border-abyss bg-red-600 px-1 font-silk text-[10px] font-bold text-white" aria-hidden data-testid="home-badge">
              {attention > 9 ? "9+" : attention}
            </span>
          )}
        </Link>
      </Tooltip>
      <div className="mx-auto h-0.5 w-8 rounded bg-white/10" />
      {hq && (
        <Tooltip label={`${hq.name} · Official`}>
          <Link href={`/tambayan/${hq.id}`} aria-label={`${hq.name} (official)`} aria-current={activeId === hq.id ? "page" : undefined} className="group relative flex" data-testid="pinned-server">
            <Pill active={activeId === hq.id} />
            <span className="rounded-[50%] ring-2 ring-sun ring-offset-2 ring-offset-[#0b1020] transition-[border-radius] group-hover:rounded-2xl">
              <ServerIcon server={hq} active={activeId === hq.id} />
            </span>
            <BadgeCheck className="absolute -bottom-1 -right-1 size-5 rounded-full bg-abyss fill-sun text-abyss" aria-hidden />
          </Link>
        </Tooltip>
      )}
      <ul className="flex flex-col items-center gap-2" data-testid="server-list">
        {others.map((server) => (
          <li key={server.id}>
            <Tooltip label={server.name}>
              <Link href={`/tambayan/${server.id}`} aria-label={server.name} aria-current={activeId === server.id ? "page" : undefined} className="group relative flex">
                <Pill active={activeId === server.id} />
                <ServerIcon server={server} active={activeId === server.id} />
              </Link>
            </Tooltip>
          </li>
        ))}
      </ul>
      <Tooltip label="Create or join a server">
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="Add a server"
          aria-haspopup="dialog"
          className="group flex size-12 items-center justify-center rounded-[50%] bg-midnight text-signal-green transition-[border-radius,background-color,color] duration-200 hover:rounded-2xl hover:bg-signal-green hover:text-white"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </Tooltip>
      <AddServerDialog open={adding} onClose={() => setAdding(false)} />
    </nav>
  );
}
