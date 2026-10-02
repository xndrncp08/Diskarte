"use client";

import { Hash, Menu as MenuIcon, Users, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { useShellUI } from "@/components/shell/ShellUI";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Channel } from "@/lib/servers";
import { cn } from "@/lib/utils";

export function ChannelHeader({ channel, actions }: { channel: Channel; actions?: ReactNode }) {
  const { setNavOpen, membersOpen, setMembersOpen } = useShellUI();
  const Icon = channel.type === "voice" ? Volume2 : Hash;
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-black/20 px-3 backdrop-blur-md">
      <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
        <MenuIcon className="size-5" aria-hidden />
      </button>
      <Icon className="size-5 shrink-0 text-slate-400" aria-hidden />
      <h1 className="truncate font-bold text-white" data-testid="channel-title">
        {channel.name}
      </h1>
      {channel.topic && (
        <>
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />
          <p className="hidden min-w-0 truncate text-sm text-slate-400 sm:block">{channel.topic}</p>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <Tooltip label={membersOpen ? "Hide members" : "Show members"} side="bottom">
          <button
            type="button"
            onClick={() => setMembersOpen(!membersOpen)}
            aria-pressed={membersOpen}
            aria-label="Toggle member list"
            className={cn("touch-target relative hidden rounded-md p-1.5 transition-colors hover:bg-white/10 lg:inline-flex", membersOpen ? "text-white" : "text-slate-400")}
          >
            <Users className="size-5" aria-hidden />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
