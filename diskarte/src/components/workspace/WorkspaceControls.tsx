"use client";

import dynamic from "next/dynamic";
import { PanelsTopLeft, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Server } from "@/lib/servers";
import { useLayout } from "./WorkspaceProvider";

const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false });

export function WorkspaceControls({ servers }: { servers: Server[] }) {
  const [layout, setLayout] = useLayout();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k" && !document.querySelector('[role="dialog"]')) { event.preventDefault(); setOpen((v) => !v); }
      if (event.shiftKey && !document.querySelector('[role="dialog"]')) {
        const href = { h: "/tambayan", m: "/tambayan/messages" }[event.key.toLowerCase()];
        if (href) { event.preventDefault(); router.push(href); }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [router]);
  const button = "flex size-11 items-center justify-center rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white";
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Go anywhere" aria-keyshortcuts="Control+k Meta+k" title="Go anywhere (⌘/Ctrl K)" className={button}><Search className="size-5" aria-hidden /></button>
    <button type="button" onClick={() => setLayout({ mode: layout.mode === "floating" ? "columns" : "floating" })} aria-label="Floating workspace" aria-pressed={layout.mode === "floating"} title="Floating workspace (wide screens)" className={`${button} max-lg:hidden aria-pressed:text-sun`}><PanelsTopLeft className="size-5" aria-hidden /></button>
    {open && <CommandPalette servers={servers} onClose={() => setOpen(false)} />}
  </>;
}
