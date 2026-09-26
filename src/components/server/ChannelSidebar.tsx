"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, Hash, HeadphoneOff, LogOut, MicOff, Pencil, Plus, Settings, UserPlus, Video, Volume2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { leaveServerAction } from "@/actions/servers";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { SignalBars } from "@/components/retro/SignalBars";
import { UserPanel } from "@/components/shell/UserPanel";
import { useShellUI } from "@/components/shell/ShellUI";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Menu } from "@/components/ui/Menu";
import { useOnline } from "@/hooks/useOnline";
import { signalLevel } from "@/lib/presence";
import { groupChannels, hasRole, type Channel } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { ChannelDialog } from "./ChannelDialog";
import { InviteDialog } from "./InviteDialog";
import { ServerSettingsDialog } from "./ServerSettingsDialog";

type DialogState =
  | { kind: "invite" }
  | { kind: "settings" }
  | { kind: "leave" }
  | { kind: "channel"; channel?: Channel; type?: "text" | "voice"; category?: string }
  | null;

function VoiceOccupants({ channelId }: { channelId: string }) {
  const { presence, members } = useServer();
  const inRoom = members.filter((m) => presence.get(m.user_id)?.voice_channel_id === channelId);
  if (inRoom.length === 0) return null;
  return (
    <ul className="mb-1 ml-7 space-y-0.5" aria-label="Nasa voice channel">
      {inRoom.map((m) => {
        const p = presence.get(m.user_id);
        return (
          <li key={m.user_id} className="flex items-center gap-2 rounded px-1.5 py-0.5 text-[13px] text-slate-300">
            <UserAvatar profile={m.profile} size={20} />
            <span className="truncate">{m.nickname ?? m.profile.display_name}</span>
            <span className="ml-auto flex items-center gap-1 text-slate-500">
              {p?.screen && <span className="rounded bg-red-500/80 px-1 font-silk text-[9px] text-white">LIVE</span>}
              {p?.video && <Video className="size-3.5" aria-label="Camera on" />}
              {p?.deafened ? <HeadphoneOff className="size-3.5 text-red-400" aria-label="Deafened" /> : p?.muted ? <MicOff className="size-3.5 text-red-400" aria-label="Muted" /> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChannelSidebar({ voiceDock }: { voiceDock?: ReactNode }) {
  const { server, channels, myRole, health } = useServer();
  const { me } = useMe();
  const { setNavOpen } = useShellUI();
  const params = useParams<{ channelId?: string }>();
  const router = useRouter();
  const online = useOnline();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [leaving, startLeave] = useTransition();
  const canManageChannels = hasRole(myRole, "moderator");
  const isOwner = server.owner_id === me.id;

  function leave() {
    startLeave(async () => {
      const result = await leaveServerAction({ serverId: server.id });
      if (!result.ok) {
        toast.error(result.error ?? "Hindi naka-leave.");
        return;
      }
      setDialog(null);
      toast(`Umalis ka sa ${server.name}.`);
      router.replace("/tambayan");
      router.refresh();
    });
  }

  return (
    <aside aria-label={`${server.name} channels`} className="glass flex h-full w-60 shrink-0 flex-col border-y-0 border-l-0">
      <Menu
        label="Server menu"
        items={[
          { label: "Invite people", icon: <UserPlus className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "invite" }) },
          { label: "Tambayan settings", icon: <Settings className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "settings" }), hidden: myRole !== "admin" },
          { label: "Create channel", icon: <Plus className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "channel" }), hidden: !canManageChannels },
          { label: "Leave tambayan", icon: <LogOut className="size-4" aria-hidden />, onSelect: () => setDialog({ kind: "leave" }), danger: true, hidden: isOwner },
        ]}
        trigger={({ toggle, open, id }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            className="flex h-12 w-full items-center justify-between border-b border-white/5 px-4 text-left font-bold text-white transition-colors hover:bg-white/5"
            data-testid="server-menu"
          >
            <span className="truncate">{server.name}</span>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      />

      <nav aria-label="Channels" className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3">
        {groupChannels(channels).map(({ category, channels: list }) => (
          <section key={category} className="mb-4">
            <div className="group mb-1 flex items-center justify-between pr-1">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [category]: !c[category] }))}
                aria-expanded={!collapsed[category]}
                className="flex items-center gap-1 font-silk text-[11px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
              >
                <ChevronDown className={cn("size-3 transition-transform", collapsed[category] && "-rotate-90")} aria-hidden />
                {category}
              </button>
              {canManageChannels && (
                <button
                  type="button"
                  aria-label={`Create channel in ${category}`}
                  onClick={() => setDialog({ kind: "channel", category, type: list[0]?.type ?? "text" })}
                  className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-white focus:opacity-100 group-hover:opacity-100"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <ul className="space-y-0.5">
              {list
                .filter((c) => !collapsed[category] || c.id === params.channelId)
                .map((channel) => {
                  const active = channel.id === params.channelId;
                  const Icon = channel.type === "voice" ? Volume2 : Hash;
                  return (
                    <li key={channel.id}>
                      <div
                        className={cn(
                          "group flex items-center rounded-md transition-colors",
                          active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                        )}
                      >
                        <Link
                          href={`/tambayan/${server.id}/${channel.id}`}
                          onClick={() => setNavOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-[15px]"
                          data-channel-type={channel.type}
                        >
                          <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
                          <span className="truncate">{channel.name}</span>
                        </Link>
                        {canManageChannels && (
                          <button
                            type="button"
                            aria-label={`Edit ${channel.name}`}
                            onClick={() => setDialog({ kind: "channel", channel })}
                            className="mr-1 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-white focus:opacity-100 group-hover:opacity-100"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                      {channel.type === "voice" && <VoiceOccupants channelId={channel.id} />}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </nav>

      {voiceDock}
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-1.5">
        <span className="font-silk text-[10px] uppercase tracking-wider text-slate-500">Realtime</span>
        <SignalBars level={signalLevel(health, online)} showLabel />
      </div>
      <UserPanel />

      <InviteDialog open={dialog?.kind === "invite"} onClose={() => setDialog(null)} />
      <ServerSettingsDialog open={dialog?.kind === "settings"} onClose={() => setDialog(null)} />
      <ChannelDialog
        open={dialog?.kind === "channel"}
        onClose={() => setDialog(null)}
        channel={dialog?.kind === "channel" ? dialog.channel : null}
        defaultType={dialog?.kind === "channel" ? dialog.type : "text"}
        defaultCategory={dialog?.kind === "channel" ? dialog.category : undefined}
      />
      <ConfirmDialog open={dialog?.kind === "leave"} onClose={() => setDialog(null)} onConfirm={leave} pending={leaving} title={`Umalis sa ${server.name}?`} confirmLabel="Leave">
        Kailangan mo ng bagong invite para makabalik.
      </ConfirmDialog>
    </aside>
  );
}
