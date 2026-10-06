"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, ChevronsDownUp, ChevronsUpDown, Hash, HeadphoneOff, Heart, Link2, LogOut, MicOff, Pencil, Plus, Radio, Rocket, Settings, ShieldCheck, Trash2, UserPlus, Video, Volume2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteChannelAction, leaveServerAction } from "@/actions/servers";
import { SupportDialog } from "@/components/community/SupportDialog";
import { useMe } from "@/components/providers/MeProvider";
import { useServerSpeaking } from "@/components/providers/PresenceProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { UserPanel } from "@/components/shell/UserPanel";
import { useShellUI } from "@/components/shell/ShellUI";
import { PersonContextMenu } from "@/components/social/PersonMenu";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItems, copyText, useContextMenu } from "@/components/ui/ContextMenu";
import { CallDock } from "@/components/voice/CallDock";
import { useIsCanvas } from "@/components/workspace/WorkspaceProvider";
import { useCall, usePrewarm } from "@/components/voice/CallProvider";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { useOnline } from "@/hooks/useOnline";
import { boostLevel } from "@/lib/community";
import { signalLevel, type PresencePayload } from "@/lib/presence";
import { groupChannels, hasRole, type Channel, type MemberWithProfile } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { ChannelDialog } from "./ChannelDialog";
import { InviteDialog } from "./InviteDialog";
import type { SettingsTab } from "./ServerSettingsDialog";

const ServerSettingsDialog = dynamic(() => import("./ServerSettingsDialog").then((m) => m.ServerSettingsDialog), { ssr: false });

type DialogState =
  | { kind: "invite" }
  | { kind: "settings"; tab?: SettingsTab }
  | { kind: "support" }
  | { kind: "leave" }
  | { kind: "channel"; channel?: Channel; type?: "text" | "voice"; category?: string }
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
  const { presence, members } = useServer();
  const inRoom = members.filter((m) => presence.get(m.user_id)?.voice_channel_id === channelId);
  if (inRoom.length === 0) return null;
  return (
    <ul className="mb-1 ml-7 space-y-0.5" aria-label="In voice">
      {inRoom.map((m) => (
        <Occupant key={m.user_id} member={m} presence={presence.get(m.user_id)} speaking={speaking?.has(m.user_id) ?? false} />
      ))}
    </ul>
  );
}

function Occupant({ member, presence: p, speaking }: { member: MemberWithProfile; presence: PresencePayload | undefined; speaking: boolean }) {
  const menu = useContextMenu();
  return (
    <li className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[13px] text-slate-300" {...menu.triggerProps}>
      <UserAvatar profile={member.profile} size={20} speaking={speaking} />
      <span className="truncate">{member.nickname ?? member.profile.display_name}</span>
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
function ChannelRow({ channel, active, canManage, onDialog }: { channel: Channel; active: boolean; canManage: boolean; onDialog: (dialog: DialogState) => void }) {
  const { server, removeChannel } = useServer();
  const { setNavOpen } = useShellUI();
  const prewarm = usePrewarm();
  const router = useRouter();
  const menu = useContextMenu();
  const Icon = channel.type === "voice" ? Volume2 : Hash;
  const label = `${channel.type === "text" ? "#" : ""}${channel.name}`;
  const icon = "size-4";
  const items: MenuItem[] = [
    { label: "Copy link", icon: <Link2 className={icon} aria-hidden />, onSelect: () => void copyText(`${window.location.origin}/tambayan/${server.id}/${channel.id}`, "Channel link") },
    { label: "Invite people", icon: <UserPlus className={icon} aria-hidden />, onSelect: () => onDialog({ kind: "invite" }), hidden: server.is_system },
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
    <li>
      <div
        className={cn("group relative flex items-center rounded-md transition-colors", active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")}
        {...menu.triggerProps}
      >
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
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-[15px] pointer-coarse:min-h-11 pointer-coarse:py-2.5"
          data-channel-type={channel.type}
          {...(channel.type === "voice" ? prewarm({ serverId: server.id, serverName: server.name, channelId: channel.id, channelName: channel.name }) : {})}
        >
          <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{channel.name}</span>
        </Link>
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
    </li>
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

export function ChannelSidebar() {
  const { server, channels, myRole, health, members, badges } = useServer();
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  // Phones keep the call dock in the drawer; on the canvas the call controls float in the tray.
  const isCanvas = useIsCanvas();
  const params = useParams<{ channelId?: string }>();
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

  const serverItems: MenuItem[] = [
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
  const allCollapsed = categories.length > 0 && categories.every(({ category }) => collapsed[category]);

  return (
    <aside aria-label={`${server.name} channels`} className="flex h-full w-60 shrink-0 flex-col max-md:glass max-md:border-y-0 max-md:border-l-0 md:w-full md:overflow-hidden">
      <Menu
        label="Server menu"
        items={serverItems}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            aria-haspopup="menu"
            className="flex h-12 w-full items-center justify-between border-b border-white/5 px-4 text-left font-bold text-white transition-colors hover:bg-white/5"
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
      <ContextMenu menu={headerMenu} label="Server menu">
        <ContextMenuItems items={serverItems} />
      </ContextMenu>

      <nav aria-label="Channels" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        <Link
          href={`/tambayan/${server.id}/lfg`}
          onClick={() => setNavOpen(false)}
          aria-current={onLfg ? "page" : undefined}
          className={cn(
            "mb-3 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm font-semibold transition-colors pointer-coarse:py-2.5",
            onLfg ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 bg-white/5 text-slate-300 hover:border-sun/40 hover:text-white",
          )}
        >
          <Radio className="size-4" aria-hidden /> LFG Board
        </Link>
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
            <ul className="space-y-0.5">
              {list
                .filter((c) => !collapsed[category] || c.id === params.channelId)
                .map((channel) => (
                  <ChannelRow key={channel.id} channel={channel} active={channel.id === params.channelId} canManage={canManageChannels} onDialog={setDialog} />
                ))}
            </ul>
          </section>
        ))}
      </nav>

      {!isCanvas && <CallDock />}
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
