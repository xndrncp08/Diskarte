"use client";

import { useParams, usePathname } from "next/navigation";
import { ChevronDown, Hash, LayoutGrid, MessagesSquare, Radio, UserPlus, Volume2 } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useChannelUnread } from "@/components/providers/UnreadsProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useChannelMenuItems, useServerControls } from "@/components/server/ChannelSidebar";
import { useShellKind } from "@/components/shell/ShellKind";
import { usePrewarm } from "@/components/voice/CallProvider";
import { useVoiceRoster } from "@/hooks/useVoiceRoster";
import { rememberChannel } from "@/lib/last-channel";
import { groupChannels, type Channel } from "@/lib/servers";
import { Button, IconButton } from "../Button";
import { ContextMenu, ContextMenuItems, Menu, useContextMenu } from "../Menu";
import { NavItem } from "../Nav";
import { usePulseUI } from "./PulseUI";

type OnDialog = ReturnType<typeof useServerControls>["setDialog"];

/** A room: unread and mentions (muted rooms dimmed, no dot), "N in voice" with the live mark, the channel menu on right-click. */
function RoomRow({ channel, active, canManage, muted, onDialog }: { channel: Channel; active: boolean; canManage: boolean; muted: boolean; onDialog: OnDialog }) {
  const { server } = useServer();
  const menu = useContextMenu();
  const prewarm = usePrewarm();
  const items = useChannelMenuItems(channel, active, canManage, muted, onDialog);
  const { unread, mentions } = useChannelUnread(channel.id, channel.last_message_at);
  // Presence of visible rooms only: this list is useServer().channels, which RLS already filtered.
  const inVoice = useVoiceRoster(channel.id).length;
  const Icon = channel.type === "voice" ? Volume2 : channel.type === "forum" ? MessagesSquare : Hash;
  const warm = channel.type === "voice" ? prewarm({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name }) : {};
  return (
    <li {...warm} {...menu.triggerProps}>
      <NavItem
        label={channel.name}
        leading={<Icon />}
        href={`/tambayan/${server.id}/${channel.id}`}
        current={active}
        unread={unread && !active && !muted}
        count={active ? 0 : mentions}
        countLabel={mentions === 1 ? "mention" : "mentions"}
        live={inVoice > 0 ? `${inVoice} in voice` : undefined}
        secondary={channel.is_private ? "Private" : undefined}
        dimmed={muted}
        className="min-h-10"
      />
      <ContextMenu menu={menu} label={`${channel.type !== "voice" ? "#" : ""}${channel.name} options`}>
        <ContextMenuItems items={items} />
      </ContextMenu>
    </li>
  );
}

function Rooms() {
  const { roomsSlot } = usePulseUI();
  const { server, channels } = useServer();
  const { channelId } = useParams<{ channelId?: string }>();
  const pathname = usePathname();
  const { serverItems, setDialog, dialogs, canManageChannels, mutes } = useServerControls();
  // The navigator reopens this Space on the room you were last in (as Classic's rail does).
  useEffect(() => {
    if (channelId) rememberChannel(server.id, channelId);
  }, [server.id, channelId]);

  const rooms = (
    <div aria-label={`${server.name} rooms`} role="group" data-testid="pulse-rooms">
      <div className="flex items-center gap-1 py-1">
        <Menu
          label="Space menu"
          items={serverItems}
          trigger={({ toggle, open, id }) => (
            <Button size="sm" variant="quiet" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" className="min-w-0 flex-1 justify-between" data-testid="server-menu">
              <span className="truncate">Space menu</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          )}
        />
        {!server.is_system && <IconButton size="sm" tooltip label="Invite people" icon={<UserPlus />} onClick={() => setDialog({ kind: "invite" })} />}
      </div>
      <ul>
        <li><NavItem label="LFG Board" leading={<Radio />} href={`/tambayan/${server.id}/lfg`} current={pathname === `/tambayan/${server.id}/lfg`} className="min-h-10" /></li>
        <li><NavItem label="Shared workspace" leading={<LayoutGrid />} href={`/tambayan/${server.id}/workspace`} current={pathname.endsWith("/workspace")} className="min-h-10" /></li>
      </ul>
      {groupChannels(channels).map(({ category, channels: list }) => (
        <section key={category} aria-label={category}>
          <h3 className="px-3 pb-1 pt-3 text-pulse-caption font-semibold text-pulse-muted">{category}</h3>
          <ul>
            {list
              .filter((c) => !(mutes.hide && mutes.muted.has(c.id) && c.id !== channelId))
              .map((c) => <RoomRow key={c.id} channel={c} active={c.id === channelId} canManage={canManageChannels} muted={mutes.muted.has(c.id)} onDialog={setDialog} />)}
          </ul>
        </section>
      ))}
    </div>
  );
  return (
    <>
      {roomsSlot && createPortal(rooms, roomsSlot)}
      {dialogs}
    </>
  );
}

/**
 * The open Space's rooms in the Pulse navigator. `[serverId]/layout.tsx` renders this beside the page (inside its
 * ServerProvider, after the notFound() membership guard), and it portals into the navigator's slot under the
 * active Space. Data is useServer() (the RLS-scoped bundle), so private rooms show only to people who can see
 * them. The Space menu, invite and channel menus are Classic's (useServerControls, useChannelMenuItems).
 * Renders nothing in Classic.
 */
export function PulseRooms() {
  return useShellKind() === "pulse" ? <Rooms /> : null;
}
