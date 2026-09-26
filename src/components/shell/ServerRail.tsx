"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
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

  return (
    <nav aria-label="Servers" className="pt-safe flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-abyss pb-3 scrollbar-none">
      <Tooltip label="Home">
        <Link href="/tambayan" aria-label="Home" aria-current={!activeId ? "page" : undefined} className="group relative flex">
          <Pill active={!activeId} />
          <span className={cn("flex size-12 items-center justify-center bg-midnight transition-[border-radius,background-color] duration-200", !activeId ? "rounded-2xl bg-sun/15" : "rounded-[50%] group-hover:rounded-2xl")}>
            <DiskarteLogo size={40} title="Diskarte home" />
          </span>
        </Link>
      </Tooltip>
      <div className="mx-auto h-0.5 w-8 rounded bg-white/10" />
      <ul className="flex flex-col items-center gap-2" data-testid="server-list">
        {servers.map((server) => (
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
      <Tooltip label="Gumawa o sumali sa tambayan">
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
