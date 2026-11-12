"use client";

import { Hash, Menu as MenuIcon, MessagesSquare, Users, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { SearchBox } from "@/components/chat/SearchBox";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { Masthead } from "@/components/pulse/shell/Masthead";
import { useShellKind } from "@/components/shell/ShellKind";
import { useShellUI } from "@/components/shell/ShellUI";
import { Tooltip } from "@/components/ui/Tooltip";
import type { Channel } from "@/lib/servers";
import { cn } from "@/lib/utils";

export function ChannelHeader({ channel, actions }: { channel: Channel; actions?: ReactNode }) {
  const { setNavOpen, membersOpen, setMembersOpen } = useShellUI();
  const shell = useShellKind();
  const space = useOptionalServer();
  const Icon = channel.type === "voice" ? Volume2 : channel.type === "forum" ? MessagesSquare : Hash;
  if (shell === "pulse") {
    const count = space ? `${space.members.length} member${space.members.length === 1 ? "" : "s"}` : null;
    return (
      <Masthead
        eyebrow={space?.server.name}
        title={channel.name}
        titleTestId="channel-title"
        description={[channel.topic, count].filter(Boolean).join(" · ") || undefined}
        actions={<>{actions}<SearchBox /></>}
        context
      />
    );
  }
  return (
    <header className="page-header">
      <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
        <MenuIcon className="size-5" aria-hidden />
      </button>
      <span className="page-header-icon" aria-hidden><Icon className="size-4" /></span>
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
        <SearchBox />
        <Tooltip label={membersOpen ? "Hide members" : "Show members"} side="bottom">
          <button
            type="button"
            onClick={() => setMembersOpen(!membersOpen)}
            aria-pressed={membersOpen}
            aria-label="Toggle member list"
            className={cn("touch-target relative hidden rounded-md p-1.5 transition-colors hover:bg-white/10 md:inline-flex", membersOpen ? "text-white" : "text-slate-400")}
          >
            <Users className="size-5" aria-hidden />
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
