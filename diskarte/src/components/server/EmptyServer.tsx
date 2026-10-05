"use client";

import { Hash, Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { useServer } from "@/components/providers/ServerProvider";
import { useShellUI } from "@/components/shell/ShellUI";
import { Button } from "@/components/ui/Button";
import { hasRole } from "@/lib/servers";
import { ChannelDialog } from "./ChannelDialog";

/** Shown when a Tambayan has no channels left. */
export function EmptyServer() {
  const { server, myRole } = useServer();
  const { setNavOpen } = useShellUI();
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-1 flex-col md:overflow-hidden">
      <header className="flex h-12 items-center border-b border-white/5 px-3 md:hidden">
        <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="rounded-md p-1.5 text-slate-300 hover:bg-white/10">
          <MenuIcon className="size-5" aria-hidden />
        </button>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <Hash className="size-12 text-slate-600" aria-hidden />
        <h1 className="text-xl font-bold text-white">No channels in {server.name} yet</h1>
        {hasRole(myRole, "moderator") ? (
          <>
            <p className="text-slate-400">Create the first channel to get the conversation going.</p>
            <Button onClick={() => setOpen(true)}>Create channel</Button>
            <ChannelDialog open={open} onClose={() => setOpen(false)} />
          </>
        ) : (
          <p className="text-slate-400">Waiting for an admin to create a channel.</p>
        )}
      </div>
    </section>
  );
}
