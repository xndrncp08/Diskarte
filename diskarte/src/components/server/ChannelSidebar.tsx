"use client";

import { motion, Reorder, useDragControls } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { BadgeCheck, BellOff, CheckCheck, ChevronDown, ChevronsDownUp, ChevronsUpDown, EyeOff, GripVertical, Hash, HeadphoneOff, Heart, Link2, Lock, LogOut, MessagesSquare, MicOff, Pencil, PencilLine, Plus, Radio, Rocket, Settings, ShieldCheck, Trash2, UserPlus, Video, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { deleteChannelAction, leaveServerAction, reorderChannelsAction } from "@/actions/servers";
import { SupportDialog } from "@/components/community/SupportDialog";
import { useMe } from "@/components/providers/MeProvider";
import { useServerSpeaking } from "@/components/providers/PresenceProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { UserPanel } from "@/components/shell/UserPanel";
import { useShellUI } from "@/components/shell/ShellUI";
import { PersonContextMenu, promptServerNickname } from "@/components/social/PersonMenu";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItems, copyText, useContextMenu } from "@/components/ui/ContextMenu";
import { CallDock } from "@/components/voice/CallDock";
import { useCall, usePrewarm } from "@/components/voice/CallProvider";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { useOnline } from "@/hooks/useOnline";
import { useVoiceRoster } from "@/hooks/useVoiceRoster";
import { useChannelUnread, useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { readChannelMutes, serverMutes, subscribeChannelMutes, toggleChannelMute, toggleHideMuted } from "@/lib/channel-mute";
import { rememberChannel } from "@/lib/last-channel";
import { DEFAULT_NOTIFY_PREFS, readNotifyPrefs, serverNotify, setServerNotify, subscribeNotifyPrefs } from "@/lib/notify-prefs";
import { boostLevel } from "@/lib/community";
import { signalLevel, type PresencePayload } from "@/lib/presence";
import { groupChannels, hasRole, type Channel, type MemberWithProfile } from "@/lib/servers";
import type { ChannelType } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { ChannelDialog } from "./ChannelDialog";
import { EventsButton } from "./EventsButton";
import { InviteDialog } from "./InviteDialog";
import type { SettingsTab } from "./ServerSettingsDialog";

const ServerSettingsDialog = dynamic(() => import("./ServerSettingsDialog").then((m) => m.ServerSettingsDialog), { ssr: false });

type DialogState =
  | { kind: "invite" }
  | { kind: "settings"; tab?: SettingsTab }
  | { kind: "support" }
  | { kind: "leave" }
  | { kind: "channel"; channel?: Channel; type?: ChannelType; category?: string }
  | null;

function VoiceOccupants({ channelId }: { channelId: string }) {
  const call = useCall();
  const { server } = useServer();
  // In the call: LiveKit's own active-speaker events. Watching from outside: the members' ephemeral
  // "speaking" broadcasts on the server's presence channel.
  const observed = useServerSpeaking(server.id);
  const live = call.status === "connected" && call.target?.channelId === channelId;
  return <OccupantList channelId={channelId} speaking={live ? new Set(call.speaking) : observed} />;
}

function OccupantList({ channelId, speaking }: { channelId: string; speaking: ReadonlySet<string> | null }) {
  const inRoom = useVoiceRoster(channelId);
  if (inRoom.length === 0) return null;
  return (
    <ul className="mb-1 ml-7 space-y-0.5" aria-label="In voice">
      {inRoom.map(({ member, presence }) => (
        <Occupant key={member.user_id} member={member} presence={presence} speaking={speaking?.has(member.user_id) ?? false} />
      ))}
    </ul>
  );
}

function Occupant({ member, presence: p, speaking }: { member: MemberWithProfile; presence: PresencePayload | undefined; speaking: boolean }) {
  const menu = useContextMenu();
  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] text-slate-300 hover:bg-white/5" data-speaking={speaking || undefined} {...menu.triggerProps}>
      {/* Discord-style: the speaking ring hugs the avatar (no offset), so it never crowds the rows around it. */}
      <span className={cn("flex shrink-0 rounded-full transition-shadow duration-150", speaking && "ring-2 ring-signal-green")}>
        <UserAvatar profile={member.profile} size={24} />
      </span>
      <span className={cn("truncate", speaking && "text-white")}>{member.nickname ?? member.profile.display_name}</span>
      <span className="ml-auto flex items-center gap-1 text-slate-500">
        {p?.screen && <span className="rounded bg-red-500/80 px-1 font-silk text-[9px] text-white">LIVE</span>}
        {p?.video && <Video className="size-3.5" aria-label="Camera on" />}
        {p?.deafened ? (
          <HeadphoneOff className="size-3.5 text-red-400" aria-label="Deafened" />
        ) : p?.muted ? (
          <MicOff className="size-3.5 text-red-400" aria-label="Muted" />
        ) : null}
      </span>
      <PersonContextMenu menu={menu} person={member.profile} />
    </li>
  );
}

/** Right-click on a channel: copy its link, invite people, edit or delete it (managers). */
function ChannelRow({
  channel,
  active,
  canManage,
  reorder,
  onDialog,
  muted = false,
}: {
  channel: Channel;
  active: boolean;
  canManage: boolean;
  /** Muted channels are dimmed (Discord). */
  muted?: boolean;
  /** Moderators drag the grip (or press ↑/↓ on it) to move the channel within its category. */
  reorder?: { onDragEnd: () => void; onMove: (delta: -1 | 1) => void };
  onDialog: (dialog: DialogState) => void;
}) {
  const drag = useDragControls();
  // A row dragged by its name must not also follow its link on release.
  const dragged = useRef(false);
  const { server, removeChannel } = useServer();
  const { setNavOpen } = useShellUI();
  const prewarm = usePrewarm();
  const router = useRouter();
  const menu = useContextMenu();
  const Icon = channel.type === "voice" ? Volume2 : channel.type === "forum" ? MessagesSquare : Hash;
  const { unread: hasUnread, mentions } = useChannelUnread(channel.id, channel.last_message_at);
  // Discord: unread channels (not muted, not the open one) are bright, with a short pill at the edge.
  const unread = hasUnread && !active && !muted;
  const label = `${channel.type !== "voice" ? "#" : ""}${channel.name}`;
  const icon = "size-4";
  const items: MenuItem[] = [
    { label: "Copy link", icon: <Link2 className={icon} aria-hidden />, onSelect: () => void copyText(`${window.location.origin}/tambayan/${server.id}/${channel.id}`, "Channel link") },
    { label: "Invite people", icon: <UserPlus className={icon} aria-hidden />, onSelect: () => onDialog({ kind: "invite" }), hidden: server.is_system },
    {
      label: "Mute Channel",
      icon: <BellOff className={icon} aria-hidden />,
      multi: true,
      checked: muted,
      onSelect: () => toggleChannelMute(server.id, channel.id),
    },
    { label: "Edit channel", icon: <Pencil className={icon} aria-hidden />, onSelect: () => onDialog({ kind: "channel", channel }), hidden: !canManage },
    {
      label: "Delete channel",
      icon: <Trash2 className={icon} aria-hidden />,
      danger: true,
      hidden: !canManage,
      onSelect: () =>
        confirmAction({
          title: `Delete ${label}?`,
          body: "Its messages go with it. This can't be undone.",
          confirmLabel: "Delete",
          onConfirm: async () => {
            const result = await deleteChannelAction({ channelId: channel.id });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't delete.");
              return false;
            }
            removeChannel(channel.id);
            toast.success(`Deleted ${label}.`);
            if (active) router.push(`/tambayan/${server.id}`);
          },
        }),
    },
  ];

  return (
    <Reorder.Item
      as="li"
      value={channel.id}
      dragListener={false}
      dragControls={drag}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={reorder?.onDragEnd}
      layout="position"
      className="relative rounded-md"
      // Same shape at rest and lifted, so the shadow and backdrop animate instead of snapping.
      style={{ backgroundColor: "rgba(30, 41, 59, 0)", boxShadow: "0px 0px 0px 0px rgba(0, 0, 0, 0), 0px 0px 0px 0px rgba(255, 184, 0, 0)" }}
      whileDrag={{ scale: 1.03, zIndex: 10, backgroundColor: "rgba(30, 41, 59, 0.95)", boxShadow: "0px 12px 28px -8px rgba(0, 0, 0, 0.6), 0px 0px 0px 1px rgba(255, 184, 0, 0.35)" }}
      transition={{ type: "spring", stiffness: 600, damping: 40, mass: 0.6 }}
    >
      <div
        className={cn("group relative flex items-center rounded-md transition-colors", active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")}
        {...menu.triggerProps}
        onPointerDown={(e) => {
          menu.triggerProps.onPointerDown(e);
          dragged.current = false;
          // Mice drag the whole row (it only lifts after a few pixels, so clicks still open it); touch keeps the grip so the list scrolls.
          if (reorder && e.pointerType === "mouse" && e.button === 0 && !(e.target as Element).closest("button")) drag.start(e);
        }}
        onClickCapture={(e) => {
          menu.triggerProps.onClickCapture(e);
          if (dragged.current) e.preventDefault();
        }}
      >
        {unread && <span className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r bg-white" aria-hidden />}
        {active && (
          <motion.span
            layoutId={`channel-pill-${server.id}`}
            className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-sun"
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            aria-hidden
          />
        )}
        <Link
          href={`/tambayan/${server.id}/${channel.id}`}
          onClick={() => setNavOpen(false)}
          aria-current={active ? "page" : undefined}
          draggable={false}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-[15px] pointer-coarse:min-h-11 pointer-coarse:py-2.5",
            muted && !active && "opacity-50",
            unread && "font-semibold text-white",
          )}
          data-unread={unread || undefined}
          data-channel-type={channel.type}
          {...(channel.type === "voice" ? prewarm({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name }) : {})}
        >
          <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{channel.name}</span>
          {channel.is_private && <Lock className="size-3 shrink-0 opacity-60" aria-label="Private" />}
          {mentions > 0 && !active && (
            <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums text-white" aria-label={`${mentions} mention${mentions === 1 ? "" : "s"}`}>
              {mentions > 99 ? "99+" : mentions}
            </span>
          )}
        </Link>
        {reorder && (
          <button
            type="button"
            aria-label={`Move ${channel.name} (drag, or use the arrow keys)`}
            onPointerDown={(e) => {
              e.preventDefault();
              drag.start(e);
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              const grip = e.currentTarget;
              reorder.onMove(e.key === "ArrowUp" ? -1 : 1);
              // React moves the row's DOM node, which drops focus; keep it on the grip for repeated presses.
              requestAnimationFrame(() => grip.focus());
            }}
            className="touch-target relative cursor-grab touch-none rounded p-1 text-slate-500 opacity-0 transition-opacity hover:text-white focus:opacity-100 active:cursor-grabbing group-hover:opacity-100 pointer-coarse:opacity-100"
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
        )}
        {canManage && (
          <button
            type="button"
            aria-label={`Edit ${channel.name}`}
            onClick={() => onDialog({ kind: "channel", channel })}
            className="touch-target relative mr-1 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-white focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      {channel.type === "voice" && <VoiceOccupants channelId={channel.id} />}
      <ContextMenu menu={menu} label={`${label} options`}>
        <ContextMenuItems items={items} />
      </ContextMenu>
    </Reorder.Item>
  );
}

/** A category heading: click folds it; right-click also offers fold-all and "Create channel". */
function CategoryHeader({
  category,
  collapsed,
  allCollapsed,
  onToggle,
  onToggleAll,
  onCreate,
}: {
  category: string;
  collapsed: boolean;
  allCollapsed: boolean;
  onToggle: () => void;
  onToggleAll: () => void;
  onCreate?: () => void;
}) {
  const menu = useContextMenu();
  const icon = "size-4";
  return (
    <div className="group mb-1 flex items-center justify-between pr-1" {...menu.triggerProps}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="touch-target relative flex items-center gap-1 font-silk text-[11px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
      >
        <ChevronDown className={cn("size-3 transition-transform", collapsed && "-rotate-90")} aria-hidden />
        {category}
      </button>
      {onCreate && (
        <button
          type="button"
          aria-label={`Create channel in ${category}`}
          onClick={onCreate}
          className="touch-target relative rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-white focus:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      )}
      <ContextMenu menu={menu} label={`${category} options`}>
        <ContextMenuItems
          items={[
            { label: collapsed ? "Expand category" : "Collapse category", icon: <ChevronDown className={cn(icon, collapsed && "-rotate-90")} aria-hidden />, onSelect: onToggle },
            {
              label: allCollapsed ? "Expand all categories" : "Collapse all categories",
              icon: allCollapsed ? <ChevronsUpDown className={icon} aria-hidden /> : <ChevronsDownUp className={icon} aria-hidden />,
              onSelect: onToggleAll,
            },
            { label: "Create channel", icon: <Plus className={icon} aria-hidden />, onSelect: () => onCreate?.(), hidden: !onCreate },
          ]}
        />
      </ContextMenu>
    </div>
  );
}

/** One category's channels; moderators can reorder them (a folded category shows only the open channel, fixed). */
function ChannelList({
  list,
  order,
  collapsed,
  activeId,
  canManage,
  onDialog,
  onReorder,
  onDragEnd,
  onMove,
  muted,
  hideMuted,
}: {
  muted: ReadonlySet<string>;
  hideMuted: boolean;
  list: Channel[];
  order: string[] | null;
  collapsed: boolean;
  activeId: string | undefined;
  canManage: boolean;
  onDialog: (dialog: DialogState) => void;
  onReorder: (ids: string[]) => void;
  onDragEnd: () => void;
  onMove: (id: string, delta: -1 | 1) => void;
}) {
  const byId = new Map(list.map((c) => [c.id, c]));
  const shown = (order ?? list.map((c) => c.id))
    .flatMap((id) => byId.get(id) ?? [])
    .filter((c) => (!collapsed || c.id === activeId) && !(hideMuted && muted.has(c.id) && c.id !== activeId));
  const reorderable = canManage && !collapsed && list.length > 1;
  return (
    <Reorder.Group as="ul" axis="y" values={shown.map((c) => c.id)} onReorder={onReorder} className="space-y-0.5">
      {shown.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          active={channel.id === activeId}
          canManage={canManage}
          reorder={reorderable ? { onDragEnd, onMove: (delta) => onMove(channel.id, delta) } : undefined}
          onDialog={onDialog}
          muted={muted.has(channel.id)}
        />
      ))}
    </Reorder.Group>
  );
}

export function ChannelSidebar() {
  const { server, channels, myRole, health, members, badges, upsertChannel } = useServer();
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  const params = useParams<{ channelId?: string }>();
  // The rail reopens this server on the channel you were last in.
  useEffect(() => {
    if (params.channelId) rememberChannel(server.id, params.channelId);
  }, [server.id, params.channelId]);
  const pathname = usePathname();
  const onLfg = pathname === `/tambayan/${server.id}/lfg`;
  const boost = boostLevel(members.filter((m) => badges.get(m.user_id)?.includes("booster")).length).level;
  const router = useRouter();
  const online = useOnline();
  const [dialog, setDialog] = useState<DialogState>(null);
  // Server settings (all its tabs) download the first time someone opens them, then stay mounted.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  if (dialog?.kind === "settings" && !settingsLoaded) setSettingsLoaded(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [leaving, startLeave] = useTransition();
  const canManageChannels = hasRole(myRole, "moderator");
  const mutes = serverMutes(useSyncExternalStore(subscribeChannelMutes, readChannelMutes, () => "{}"), server.id);
  const notify = serverNotify(useSyncExternalStore(subscribeNotifyPrefs, readNotifyPrefs, () => DEFAULT_NOTIFY_PREFS), server.id);
  const isOwner = server.owner_id === me.id;

  function leave() {
    startLeave(async () => {
      const result = await leaveServerAction({ serverId: server.id });
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't leave.");
        return;
      }
      setDialog(null);
      toast(`You left ${server.name}.`);
      router.replace("/tambayan");
      router.refresh();
    });
  }

  const unreads = useOptionalUnreads();
  const serverItems: MenuItem[] = [
    { label: "Mark As Read", icon: <CheckCheck className="size-4" aria-hidden />, onSelect: () => unreads?.markAllRead(server.id), hidden: !unreads },
    // Everyone is already in Diskarte HQ.
    { label: "Invite people", icon: <UserPlus className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "invite" }), hidden: server.is_system },
    {
      label: "Server settings",
      icon: <Settings className="size-4" aria-hidden />,
      onSelect: () => setDialog({ kind: "settings" }),
      hidden: myRole !== "admin",
    },
    {
      label: "Bantay-Bayan",
      icon: <ShieldCheck className="size-4" aria-hidden />,
      onSelect: () => setDialog({ kind: "settings", tab: "audit" }),
      hidden: !canManageChannels,
    },
    { label: "Support this server", icon: <Heart className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "support" }) },
    {
      label: "Edit Per-server Profile",
      icon: <PencilLine className="size-4" aria-hidden />,
      onSelect: () => {
        const mine = members.find((m) => m.user_id === me.id);
        promptServerNickname({ serverId: server.id, serverName: server.name, userId: me.id, displayName: me.display_name, current: mine?.nickname ?? null, self: true });
      },
    },
    { label: "Hide Muted Channels", icon: <EyeOff className="size-4" aria-hidden />, multi: true, checked: mutes.hide, onSelect: () => toggleHideMuted(server.id) },
    // Discord's Notification Settings: what alerts you from this server, and muting it.
    { label: "Only @mentions", group: "Notification Settings", checked: notify.level === "mentions", onSelect: () => setServerNotify(server.id, { level: "mentions" }) },
    { label: "Nothing", group: "Notification Settings", checked: notify.level === "nothing", onSelect: () => setServerNotify(server.id, { level: "nothing" }) },
    { label: "Mute Server", group: "Notification Settings", icon: <BellOff className="size-4" aria-hidden />, multi: true, checked: notify.muted, onSelect: () => setServerNotify(server.id, { muted: !notify.muted, muteUntil: undefined }) },
    { label: "Mute for 1 hour", group: "Notification Settings", onSelect: () => setServerNotify(server.id, { muted: true, muteUntil: Date.now() + 3600000 }) },
    { label: "Mute for 8 hours", group: "Notification Settings", onSelect: () => setServerNotify(server.id, { muted: true, muteUntil: Date.now() + 8 * 3600000 }) },
    {
      label: "Create channel",
      icon: <Plus className="size-4" aria-hidden />,
      onSelect: () => setDialog({ kind: "channel" }),
      hidden: !canManageChannels,
    },
    {
      label: "Leave server",
      icon: <LogOut className="size-4" aria-hidden />,
      onSelect: () => setDialog({ kind: "leave" }),
      danger: true,
      // Nobody leaves Diskarte HQ; owners leave by deleting their server.
      hidden: isOwner || server.is_system,
    },
  ];
  const headerMenu = useContextMenu();
  const categories = groupChannels(channels);
  // The order being dragged (one category at a time); a ref too, so drag-end reads the final order.
  const [dragOrder, setDragOrder] = useState<{ category: string; ids: string[] } | null>(null);
  const dragRef = useRef(dragOrder);
  function drafting(order: { category: string; ids: string[] } | null) {
    dragRef.current = order;
    setDragOrder(order);
  }

  /** Optimistically renumbers the whole server top to bottom, then saves; rolls back if the save fails. */
  function commitOrder(category: string, ids: string[]) {
    drafting(null);
    const order = categories.flatMap((g) => (g.category === category ? ids : g.channels.map((c) => c.id)));
    const byId = new Map(channels.map((c) => [c.id, c]));
    const before = order.map((id) => byId.get(id)!).filter((c, i) => c.position !== i);
    if (before.length === 0) return;
    for (const c of before) upsertChannel({ ...c, position: order.indexOf(c.id) });
    void reorderChannelsAction({ serverId: server.id, channelIds: order })
      .catch(() => ({ ok: false, error: "Couldn't reach Diskarte. The order wasn't saved." }))
      .then((result) => {
        if (result.ok) return;
        for (const c of before) upsertChannel(c);
        toast.error(result.error ?? "Couldn't reorder the channels.");
      });
  }
  const allCollapsed = categories.length > 0 && categories.every(({ category }) => collapsed[category]);

  return (
    <aside aria-label={`${server.name} channels`} className="flex h-full w-60 shrink-0 flex-col max-md:glass max-md:border-y-0 max-md:border-l-0 md:w-full md:overflow-hidden">
      <div className="flex border-b border-white/5">
        <Menu
          label="Server menu"
          className="min-w-0 flex-1"
          items={serverItems}
          trigger={({ toggle, open, id }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls={id}
              aria-haspopup="menu"
              className="flex h-12 w-full items-center justify-between px-4 text-left font-bold text-white transition-colors hover:bg-white/5"
              data-testid="server-menu"
              {...headerMenu.triggerProps}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{server.name}</span>
                {server.is_system && <BadgeCheck className="size-4 shrink-0 fill-sun text-abyss" aria-label="Official server" />}
                {boost > 0 && (
                  <span className="shrink-0 rounded bg-fuchsia-500/20 px-1 font-pixel text-[8px] text-fuchsia-200" title={`Boost level ${boost}`}>
                    <Rocket className="mr-0.5 inline size-2.5" aria-hidden />
                    {boost}
                  </span>
                )}
              </span>
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          )}
        />
        {!server.is_system && (
          <button
            type="button"
            aria-label="Invite people"
            title="Invite people"
            onClick={() => setDialog({ kind: "invite" })}
            className="flex w-11 shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-white/5 hover:text-sun"
            data-testid="invite-button"
          >
            <UserPlus className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <ContextMenu menu={headerMenu} label="Server menu">
        <ContextMenuItems items={serverItems} />
      </ContextMenu>

      <nav aria-label="Channels" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        <Link
          href={`/tambayan/${server.id}/lfg`}
          onClick={() => setNavOpen(false)}
          aria-current={onLfg ? "page" : undefined}
          className={cn(
            "mb-3 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors pointer-coarse:min-h-11",
            onLfg ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 bg-white/5 text-slate-300 hover:border-sun/40 hover:text-white",
          )}
        >
          <Radio className="size-4" aria-hidden /> LFG Board
        </Link>
        <EventsButton />
        <Link href={`/tambayan/${server.id}/workspace`} onClick={() => setNavOpen(false)} aria-current={pathname.endsWith("/workspace") ? "page" : undefined} className="mb-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-300 hover:bg-white/5 aria-[current=page]:bg-white/10">Shared workspace</Link>
        {/* Just you here: the one thing worth doing next is bringing people in. */}
        {!server.is_system && members.length === 1 && (
          <button
            type="button"
            onClick={() => setDialog({ kind: "invite" })}
            className="mb-3 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-sun/40 bg-sun/5 px-2.5 py-2 text-left transition-colors hover:border-sun/70 hover:bg-sun/10"
          >
            <UserPlus className="size-5 shrink-0 text-sun" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">Invite your friends</span>
              <span className="block text-xs text-slate-400">It&apos;s quiet in here. Send them a link.</span>
            </span>
          </button>
        )}
        {categories.map(({ category, channels: list }) => (
          <section key={category} className="mb-4">
            <CategoryHeader
              category={category}
              collapsed={Boolean(collapsed[category])}
              allCollapsed={allCollapsed}
              onToggle={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))}
              onToggleAll={() => setCollapsed(Object.fromEntries(categories.map((g) => [g.category, !allCollapsed])))}
              onCreate={canManageChannels ? () => setDialog({ kind: "channel", category, type: list[0]?.type ?? "text" }) : undefined}
            />
            <ChannelList
              list={list}
              order={dragOrder?.category === category ? dragOrder.ids : null}
              collapsed={Boolean(collapsed[category])}
              activeId={params.channelId}
              canManage={canManageChannels}
              onDialog={setDialog}
              muted={mutes.muted}
              hideMuted={mutes.hide}
              onReorder={(ids) => drafting({ category, ids })}
              onDragEnd={() => dragRef.current?.category === category && commitOrder(category, dragRef.current.ids)}
              onMove={(id, delta) => {
                const ids = list.map((c) => c.id);
                const from = ids.indexOf(id);
                const to = from + delta;
                if (to < 0 || to >= ids.length) return;
                [ids[from], ids[to]] = [ids[to], ids[from]];
                commitOrder(category, ids);
              }}
            />
          </section>
        ))}
      </nav>

      <CallDock />
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-1.5">
        <span className="font-silk text-[10px] uppercase tracking-wider text-slate-500">Realtime</span>
        <SignalBars level={signalLevel(health, online)} showLabel />
      </div>
      <UserPanel />

      <InviteDialog open={dialog?.kind === "invite"} onClose={() => setDialog(null)} />
      {settingsLoaded && (
        <ServerSettingsDialog open={dialog?.kind === "settings"} onClose={() => setDialog(null)} initialTab={dialog?.kind === "settings" ? (dialog.tab ?? (myRole === "admin" ? "overview" : "audit")) : "overview"} />
      )}
      <SupportDialog open={dialog?.kind === "support"} onClose={() => setDialog(null)} />
      <ChannelDialog
        open={dialog?.kind === "channel"}
        onClose={() => setDialog(null)}
        channel={dialog?.kind === "channel" ? dialog.channel : null}
        defaultType={dialog?.kind === "channel" ? dialog.type : "text"}
        defaultCategory={dialog?.kind === "channel" ? dialog.category : undefined}
      />
      <ConfirmDialog
        open={dialog?.kind === "leave"}
        onClose={() => setDialog(null)}
        onConfirm={leave}
        pending={leaving}
        title={`Leave ${server.name}?`}
        confirmLabel="Leave"
      >
        You&apos;ll need a new invite to come back.
      </ConfirmDialog>
    </aside>
  );
}
