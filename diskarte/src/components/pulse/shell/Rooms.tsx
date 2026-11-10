"use client";

import { useParams, usePathname } from "next/navigation";
import { LayoutGrid, MessagesSquare, MoreHorizontal, Radio, UserPlus, Volume2 } from "lucide-react";
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
import { IconButton } from "../Button";
import { ContextMenu, ContextMenuItems, Menu, useContextMenu } from "../Menu";
import { NavItem } from "../Nav";
import { usePulseUI } from "./PulseUI";

type OnDialog = ReturnType<typeof useServerControls>["setDialog"];

// The categories every Space starts with say nothing a room's icon doesn't; custom categories keep their label.
const DEFAULT_CATEGORIES = new Set(["Text Channels", "Voice Channels"]);
// A section with no rows (every voice room moved to Live, or nothing live) hides itself, heading included.
const SECTION = "hidden has-[li]:block";
const HEADING = "px-3 pb-1 pt-3 text-pulse-caption font-semibold text-pulse-muted";

/**
 * A room: unread and mentions (muted rooms dimmed, no dot), "N in voice" with the live mark, the channel menu on
 * right-click. `place` lists a room where it belongs: an occupied voice room under Live, the rest in their category.
 */
function RoomRow({ channel, active, canManage, muted, onDialog, place }: { channel: Channel; active: boolean; canManage: boolean; muted: boolean; onDialog: OnDialog; place: "live" | "category" }) {
  const { server } = useServer();
  const menu = useContextMenu();
  const prewarm = usePrewarm();
  const items = useChannelMenuItems(channel, active, canManage, muted, onDialog);
  const { unread, mentions } = useChannelUnread(channel.id, channel.last_message_at);
  // Presence of visible rooms only: this list is useServer().channels, which RLS already filtered.
  const inVoice = useVoiceRoster(channel.id).length;
  if ((place === "live") !== inVoice > 0) return null;
  const warm = channel.type === "voice" ? prewarm({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name }) : {};
  return (
    <li {...warm} {...menu.triggerProps}>
      <NavItem
        label={channel.name}
        // Text rooms have no # icon; an empty slot keeps every room name on one line with LFG and the voice rooms.
        leading={channel.type === "voice" ? <Volume2 /> : channel.type === "forum" ? <MessagesSquare /> : <span className="block size-5" />}
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
  const { roomsSlot, spaceActionsSlot } = usePulseUI();
  const { server, channels } = useServer();
  const { channelId } = useParams<{ channelId?: string }>();
  const pathname = usePathname();
  const { serverItems, setDialog, dialogs, canManageChannels, mutes } = useServerControls();
  // The navigator reopens this Space on the room you were last in (as Classic's rail does).
  useEffect(() => {
    if (channelId) rememberChannel(server.id, channelId);
  }, [server.id, channelId]);
  const shown = (list: Channel[]) => list.filter((c) => !(mutes.hide && mutes.muted.has(c.id) && c.id !== channelId));
  const row = (c: Channel, place: "live" | "category") => <RoomRow key={c.id} channel={c} active={c.id === channelId} canManage={canManageChannels} muted={mutes.muted.has(c.id)} onDialog={setDialog} place={place} />;
  const groups = groupChannels(channels);

  // On the open Space's row: its menu (Classic's server menu) and Invite.
  const actions = (
    <>
      <Menu
        label={`${server.name} options`}
        items={serverItems}
        trigger={({ toggle, open, id }) => (
          <IconButton size="sm" tooltip label={`${server.name} options`} icon={<MoreHorizontal />} onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" data-testid="server-menu" />
        )}
      />
      {!server.is_system && <IconButton size="sm" tooltip label="Invite people" icon={<UserPlus />} onClick={() => setDialog({ kind: "invite" })} />}
    </>
  );

  const rooms = (
    <div aria-label={`${server.name} rooms`} role="group" data-testid="pulse-rooms">
      <ul>
        <li><NavItem label="LFG Board" leading={<Radio />} href={`/tambayan/${server.id}/lfg`} current={pathname === `/tambayan/${server.id}/lfg`} className="min-h-10" /></li>
        <li><NavItem label="Shared workspace" leading={<LayoutGrid />} href={`/tambayan/${server.id}/workspace`} current={pathname.endsWith("/workspace")} className="min-h-10" /></li>
      </ul>
      <section aria-label="Live" className={SECTION}>
        <h3 className={HEADING}>Live</h3>
        <ul>{shown(channels.filter((c) => c.type === "voice")).map((c) => row(c, "live"))}</ul>
      </section>
      {groups.map(({ category, channels: list }) => {
        const named = !DEFAULT_CATEGORIES.has(category);
        return (
          <section key={category} aria-label={category} className={SECTION}>
            {named && <h3 className={HEADING}>{category}</h3>}
            <ul className={named ? undefined : "pt-2"}>{shown(list).map((c) => row(c, "category"))}</ul>
          </section>
        );
      })}
    </div>
  );
  return (
    <>
      {spaceActionsSlot && createPortal(actions, spaceActionsSlot)}
      {roomsSlot && createPortal(rooms, roomsSlot)}
      {dialogs}
    </>
  );
}

/**
 * The open Space's rooms in the Pulse navigator. `[serverId]/layout.tsx` renders this beside the page (inside its
 * ServerProvider, after the notFound() membership guard), and it portals the rooms into the navigator's slot under
 * the active Space and the Space's "…" menu and Invite onto its row. Data is useServer() (the RLS-scoped bundle), so
 * private rooms show only to people who can see them. The Space menu, invite and channel menus are Classic's
 * (useServerControls, useChannelMenuItems). Occupied voice rooms move up under Live. Renders nothing in Classic.
 */
export function PulseRooms() {
  return useShellKind() === "pulse" ? <Rooms /> : null;
}
