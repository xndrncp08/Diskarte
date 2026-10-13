"use client";

import { AlarmClockOff, ArrowUpRight, ArrowRightLeft, AtSign, Ban, BellRing, Clock, Gavel, TriangleAlert, HeadphoneOff, MessageCircle, MicOff, PencilLine, Phone, PhoneOff, ShieldOff, StickyNote, UserCheck, UserMinus, UserPlus, UserRound, UserX, VideoOff, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext } from "react";
import { toast } from "sonner";
import { banMemberAction, removeTimeoutAction, timeoutMemberAction, warnMemberAction } from "@/actions/moderation";
import { assignRoleAction, kickMemberAction, transferOwnershipAction, setMemberRoleAction, setNicknameAction } from "@/actions/servers";
import { openDmAction } from "@/actions/social";
import { moderateVoiceAction } from "@/actions/voice";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalServer } from "@/components/providers/ServerProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { openMemberProfile } from "@/components/server/memberProfiles";
import { confirmAction } from "@/components/ui/ConfirmHost";
import { ContextMenu, ContextMenuItems, copyText, type ContextMenuState } from "@/components/ui/ContextMenu";
import type { MenuItem } from "@/components/ui/Menu";
import { CallContext } from "@/components/voice/CallProvider";
import { useRinger } from "@/components/voice/IncomingCalls";
import { useFriendActions } from "@/hooks/useFriendActions";
import { TIMEOUT_OPTIONS } from "@/lib/community";
import { canManageMember, isTimedOut, ROLE_LABEL } from "@/lib/servers";
import { requestMention } from "@/lib/mention";
import { friendStatus } from "@/lib/social";

/** Ask for a server nickname (yours: Discord's "Edit Per-server Profile") and save it. */
export function promptServerNickname(opts: { serverId: string; serverName: string; userId: string; displayName: string; current: string | null; self: boolean }) {
  const { serverId, serverName, userId, displayName, current, self } = opts;
  confirmAction({
    title: self ? "Change your nickname" : `Change ${current ?? displayName}'s nickname`,
    body: `Everyone in ${serverName} sees it. Leave it empty to go back to ${self ? "your" : "their"} display name.`,
    confirmLabel: "Save",
    danger: false,
    reason: { label: "Server nickname", placeholder: displayName, maxLength: 32, initial: current ?? "" },
    onConfirm: async (nickname) => {
      const result = await setNicknameAction({ serverId, userId, nickname });
      if (!result.ok) {
        toast.error(result.fieldErrors?.nickname ?? result.error ?? "Couldn't change the nickname.");
        return false;
      }
      toast.success(nickname ? `Nickname set to ${nickname}.` : "Nickname cleared.");
    },
  });
}

export interface Person {
  id: string;
  username: string;
  display_name: string;
}

const icon = "size-4";

/** In a voice channel of this server? Then you can ring `userId` to join you there. */
export function useRingChannel(userId: string) {
  const call = useContext(CallContext);
  const ringer = useRinger();
  const server = useOptionalServer()?.server;
  const { me } = useMe();
  const target = call?.status === "connected" && call.target && call.target.kind !== "dm" && call.target.serverId === server?.id && userId !== me.id ? call.target : null;
  return target && ringer ? { channelName: target.channelName, ring: (name: string) => ringer.ringToVoice(userId, name) } : null;
}

/**
 * Everything you can do to someone: profile, DM, friend request (add / accept / cancel / remove),
 * ring into voice, copy their @username, block — plus role / kick / ban inside a server when your
 * role outranks theirs. Items that don't apply are hidden rather than disabled.
 */
export function PersonMenuItems({
  person,
  anchor = null,
  onViewProfile,
  before = [],
  after = [],
}: {
  person: Person;
  /** Where a popped-out profile window appears. */
  anchor?: HTMLElement | null;
  /** Overrides "Profile" (the member list opens its own popover). Defaults to the server profile window. */
  onViewProfile?: () => void;
  /** Context-specific rows around the person rows (e.g. "Mark as read" on a DM). */
  before?: MenuItem[];
  after?: MenuItem[];
}) {
  const { me } = useMe();
  const social = useOptionalSocial();
  const friends = useFriendActions();
  const serverCtx = useOptionalServer();
  const ring = useRingChannel(person.id);

  const self = person.id === me.id;
  const member = serverCtx?.members.find((m) => m.user_id === person.id);
  const name = member?.nickname ?? person.display_name;
  const status = social ? friendStatus(me.id, person.id, social.friends, social.blocked) : null;
  const perms = serverCtx && member ? canManageMember({ actorRole: serverCtx.myRole, actorId: me.id, target: member, ownerId: serverCtx.server.owner_id }) : null;
  const timedOut = isTimedOut(member);
  const viewProfile = onViewProfile ?? (member ? () => openMemberProfile(member.user_id, anchor) : undefined);

  function setRole(role: (typeof ROLES)[number]) {
    if (!serverCtx) return;
    void setMemberRoleAction({ serverId: serverCtx.server.id, userId: person.id, role }).then((result) =>
      result.ok ? toast.success(`${name} is now ${ROLE_LABEL[role]}.`) : toast.error(result.error ?? "Couldn't change the role."),
    );
  }

  function changeServerNickname() {
    if (!serverCtx || !member) return;
    promptServerNickname({ serverId: serverCtx.server.id, serverName: serverCtx.server.name, userId: person.id, displayName: person.display_name, current: member.nickname, self });
  }

  function changeFriendNickname() {
    if (!social) return;
    confirmAction({
      title: `Nickname for ${person.display_name}`,
      body: "Only you see it, in your friends list and DMs. Leave it empty to remove it.",
      confirmLabel: "Save",
      danger: false,
      reason: { label: "Friend nickname", placeholder: person.display_name, maxLength: 32, initial: social.nicknames.get(person.id) ?? "" },
      onConfirm: async (nickname) => {
        if (!(await social.setNickname(person.id, nickname))) {
          toast.error("Couldn't save the nickname.");
          return false;
        }
        toast.success(nickname ? `You call them ${nickname} now.` : "Nickname removed.");
      },
    });
  }

  // ---- Discord's extras: mention, call, note, and per-person call controls ----
  const call = useContext(CallContext);
  const router = useRouter();
  const supabase = useOptionalSupabase();
  const ringer = useRinger();
  const lk = call?.room?.remoteParticipants.get(person.id);
  const inMyCall = !self && !!lk && call?.status !== "idle";
  // Where they are in voice in this server (my own room, or what presence says), for moderation.
  const voiceChannel = inMyCall && call?.target?.kind !== "dm" ? (call?.target?.channelId ?? null) : (serverCtx?.presence.get(person.id)?.voice_channel_id ?? null);
  const sources = lk?.permissions?.canPublishSources ?? [];
  const serverMuted = sources.length > 0 && !sources.includes(2 /* MICROPHONE */);
  const serverDeafened = lk?.permissions?.canSubscribe === false;
  const canModerateVoice = !!voiceChannel && !!perms?.kick;

  async function startCall() {
    if (!call) return;
    const dm = await openDmAction({ userId: person.id });
    if (!dm.ok || !dm.data) {
      toast.error(dm.error ?? "Couldn't start the call.");
      return;
    }
    const id = dm.data.conversationId;
    router.push(`/tambayan/dm/${id}`);
    await call.join({ kind: "dm", serverId: "", serverName: "Direct Message", channelId: id, channelName: name });
    void ringer?.ringDm(id);
  }

  async function editNote() {
    if (!supabase) return;
    const { data } = await supabase.from("user_notes").select("note").eq("target_id", person.id).maybeSingle();
    confirmAction({
      title: `Note about ${name}`,
      body: "Only you can see it.",
      confirmLabel: "Save",
      danger: false,
      reason: { label: "Note", placeholder: "Click to add a note", maxLength: 256, initial: data?.note ?? "" },
      onConfirm: async (note) => {
        const { error } = note
          ? await supabase.from("user_notes").upsert({ owner_id: me.id, target_id: person.id, note, updated_at: new Date().toISOString() })
          : await supabase.from("user_notes").delete().eq("owner_id", me.id).eq("target_id", person.id);
        if (error) {
          toast.error("Couldn't save the note.");
          return false;
        }
        toast.success(note ? "Note saved." : "Note removed.");
      },
    });
  }

  function moderate(action: "mute" | "unmute" | "deafen" | "undeafen" | "disconnect" | "move", toChannelId?: string) {
    if (!voiceChannel) return;
    void moderateVoiceAction({ channelId: voiceChannel, userId: person.id, action, toChannelId }).then((result) => {
      if (!result.ok) toast.error(result.error ?? "Couldn't do that.");
    });
  }
  const moveTargets = (serverCtx?.channels ?? []).filter((c) => c.type === "voice" && c.id !== voiceChannel && !c.is_private);

  const items: MenuItem[] = [
    ...before,
    { label: "Profile", icon: <UserRound className={icon} aria-hidden />, onSelect: () => viewProfile?.(), hidden: !viewProfile },
    { label: "Mention", icon: <AtSign className={icon} aria-hidden />, onSelect: () => requestMention(person.username), hidden: !serverCtx },
    { label: "Message", icon: <MessageCircle className={icon} aria-hidden />, onSelect: () => void friends.message(person.id), hidden: self || !social || status === "blocked" },
    { label: "Start a Call", icon: <Phone className={icon} aria-hidden />, onSelect: () => void startCall(), hidden: self || !social || !call || status !== "accepted" },
    { label: "Add Note", hint: "Only visible to you", icon: <StickyNote className={icon} aria-hidden />, onSelect: () => void editNote(), hidden: self || !supabase },
    {
      label: "User Volume",
      onSelect: () => undefined,
      hidden: !inMyCall,
      control: (
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={Math.round((call?.mix.people[person.id] ?? 1) * 100)}
          onChange={(e) => call?.setParticipantVolume(person.id, Number(e.target.value) / 100)}
          aria-label={`Volume for ${name}`}
          className="w-full accent-sun"
        />
      ),
    },
    { label: "Mute", icon: <VolumeX className={icon} aria-hidden />, multi: true, checked: !!call?.mix.muted?.[person.id], onSelect: () => call?.toggleLocalMute(person.id), hidden: !inMyCall },
    { label: "Disable Video", icon: <VideoOff className={icon} aria-hidden />, multi: true, checked: !!call?.mix.videoOff?.[person.id], onSelect: () => call?.toggleVideoOff(person.id), hidden: !inMyCall },
    { label: "Add Friend", icon: <UserPlus className={icon} aria-hidden />, onSelect: () => void friends.add(person.username), hidden: status !== "none" },
    { label: "Accept friend request", icon: <UserCheck className={icon} aria-hidden />, onSelect: () => void friends.accept(person.id), hidden: status !== "incoming" },
    { label: "Ignore friend request", icon: <UserX className={icon} aria-hidden />, onSelect: () => void friends.ignore(person.id), hidden: status !== "incoming" },
    { label: "Cancel friend request", icon: <UserX className={icon} aria-hidden />, onSelect: () => void friends.cancel(person.id), hidden: status !== "outgoing" },
    {
      label: ring ? `Ring into ${ring.channelName}` : "Ring into voice",
      icon: <BellRing className={icon} aria-hidden />,
      onSelect: () => void ring?.ring(name),
      hidden: !ring,
    },
    { label: "Change nickname", icon: <PencilLine className={icon} aria-hidden />, onSelect: changeServerNickname, hidden: !member || !(self || perms?.rename) },
    { label: social?.nicknames.has(person.id) ? "Edit friend nickname" : "Add friend nickname", icon: <PencilLine className={icon} aria-hidden />, onSelect: changeFriendNickname, hidden: status !== "accepted" },
    { label: "Copy username", icon: <AtSign className={icon} aria-hidden />, onSelect: () => void copyText(`@${person.username}`, "Username") },
    {
      label: "Remove Friend",
      icon: <UserMinus className={icon} aria-hidden />,
      danger: true,
      hidden: status !== "accepted",
      onSelect: () => confirmAction({ title: `Remove ${name} as a friend?`, confirmLabel: "Remove Friend", onConfirm: () => friends.remove(person.id) }),
    },
    {
      label: "Unblock",
      icon: <ShieldOff className={icon} aria-hidden />,
      onSelect: () => void friends.unblock(person.id),
      hidden: status !== "blocked",
    },
    {
      label: "Block",
      icon: <Ban className={icon} aria-hidden />,
      danger: true,
      hidden: self || status === null || status === "blocked",
      onSelect: () =>
        confirmAction({
          title: `Block ${name}?`,
          body: "They won't be able to message you or send you friend requests, and they'll be removed from your friends.",
          confirmLabel: "Block",
          onConfirm: () => friends.block(person.id),
        }),
    },
    ...after,
    ...ROLES.map((role) => ({ label: ROLE_LABEL[role], group: "Role", checked: member?.role === role, onSelect: () => member?.role !== role && setRole(role), hidden: !perms?.changeRole })),
    // Custom roles: admins hand them out (yourself included).
    ...(serverCtx?.roles ?? []).map((r) => {
      const has = serverCtx?.memberRoles.get(person.id)?.includes(r.id) ?? false;
      return {
        label: r.name,
        icon: <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden />,
        group: "Roles",
        checked: has,
        multi: true,
        hidden: !member || serverCtx?.myRole !== "admin",
        onSelect: () =>
          void assignRoleAction({ serverId: serverCtx!.server.id, userId: person.id, roleId: r.id, assigned: !has }).then((result) => {
            if (!result.ok) toast.error(result.error ?? "Couldn't change the role.");
            else serverCtx!.reloadRoles();
          }),
      };
    }),
    {
      label: "Remove Timeout",
      icon: <AlarmClockOff className={icon} aria-hidden />,
      group: "Moderation",
      hidden: !perms?.timeout || !timedOut,
      onSelect: () =>
        void removeTimeoutAction({ serverId: serverCtx!.server.id, userId: person.id }).then((result) =>
          result.ok ? toast.success(`${name} can talk again.`) : toast.error(result.error ?? "Couldn't remove the timeout."),
        ),
    },
    {
      label: "Transfer Ownership",
      icon: <ArrowUpRight className={icon} aria-hidden />,
      danger: true,
      group: "Moderation",
      hidden: self || !member || !serverCtx || serverCtx.server.owner_id !== me.id || serverCtx.server.is_system,
      onSelect: () =>
        confirmAction({
          title: `Transfer ownership to ${name}?`,
          body: `${name} becomes the owner of ${serverCtx?.server.name}. You stay an admin, but you can't undo this yourself.`,
          confirmLabel: "Transfer Ownership",
          onConfirm: async () => {
            const result = await transferOwnershipAction({ serverId: serverCtx!.server.id, userId: person.id });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't transfer the server.");
              return false;
            }
            toast.success(`${name} owns ${serverCtx?.server.name} now.`);
          },
        }),
    },
    ...TIMEOUT_OPTIONS.map((o) => ({
      label: o.label,
      icon: <Clock className={icon} aria-hidden />,
      group: `Timeout ${name}`,
      hidden: !perms?.timeout || timedOut,
      onSelect: () =>
        confirmAction({
          title: `Timeout ${name} for ${o.label}?`,
          body: "They can still read, but can't send messages, react or join voice until it ends.",
          confirmLabel: "Timeout",
          reason: { label: "Reason (optional)", placeholder: "Spamming, off-topic…" },
          onConfirm: async (reason) => {
            const result = await timeoutMemberAction({ serverId: serverCtx!.server.id, userId: person.id, minutes: o.minutes, reason });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't time them out.");
              return false;
            }
            toast.success(`Timed out ${name} for ${o.label}.`);
          },
        }),
    })),
    {
      label: `Warn ${name}`,
      icon: <TriangleAlert className={icon} aria-hidden />,
      group: "Moderation",
      hidden: !perms?.kick,
      onSelect: () =>
        confirmAction({
          title: `Warn ${name}?`,
          body: "They'll see this the next time they open the server. It's logged in the audit log.",
          confirmLabel: "Warn",
          reason: { label: "Reason", placeholder: "Keep it friendly, no spam.", maxLength: 300 },
          onConfirm: async (reason) => {
            const result = await warnMemberAction({ serverId: serverCtx!.server.id, userId: person.id, reason });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't warn them.");
              return false;
            }
            toast.success(`Warned ${name}.`);
          },
        }),
    },
    {
      label: `Kick ${name}`,
      icon: <UserMinus className={icon} aria-hidden />,
      danger: true,
      group: "Moderation",
      hidden: !perms?.kick,
      onSelect: () =>
        confirmAction({
          title: `Kick ${name}?`,
          body: `They'll be removed from ${serverCtx?.server.name} but can rejoin with an invite.`,
          confirmLabel: "Kick",
          onConfirm: async () => {
            const result = await kickMemberAction({ serverId: serverCtx!.server.id, userId: person.id });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't kick.");
              return false;
            }
            toast.success(`Kicked ${name}.`);
          },
        }),
    },
    {
      label: `Ban ${name}`,
      icon: <Gavel className={icon} aria-hidden />,
      danger: true,
      group: "Moderation",
      hidden: !perms?.kick,
      onSelect: () =>
        confirmAction({
          title: `Ban ${name}?`,
          body: `They'll be removed from ${serverCtx?.server.name} and can't rejoin until unbanned.`,
          confirmLabel: "Ban",
          reason: { label: "Reason (optional)", placeholder: "Spam, toxic, scam links…" },
          onConfirm: async (reason) => {
            const result = await banMemberAction({ serverId: serverCtx!.server.id, userId: person.id, reason });
            if (!result.ok) {
              toast.error(result.error ?? "Couldn't ban.");
              return false;
            }
            toast.success(`Banned ${name}.`);
          },
        }),
    },
  ];

  const voiceItems: MenuItem[] = [
    { label: "Server Mute", icon: <MicOff className={icon} aria-hidden />, multi: true, checked: serverMuted, danger: true, group: "Voice", onSelect: () => moderate(serverMuted ? "unmute" : "mute"), hidden: !canModerateVoice },
    { label: "Server Deafen", icon: <HeadphoneOff className={icon} aria-hidden />, multi: true, checked: serverDeafened, danger: true, group: "Voice", onSelect: () => moderate(serverDeafened ? "undeafen" : "deafen"), hidden: !canModerateVoice },
    { label: "Disconnect", icon: <PhoneOff className={icon} aria-hidden />, danger: true, group: "Voice", onSelect: () => moderate("disconnect"), hidden: !canModerateVoice },
    ...moveTargets.map((c) => ({ label: c.name, icon: <ArrowRightLeft className={icon} aria-hidden />, group: "Move to", onSelect: () => moderate("move", c.id), hidden: !canModerateVoice })),
  ];

  return <ContextMenuItems items={[...items, ...voiceItems]} />;
}

const ROLES = ["member", "moderator", "admin"] as const;

/** A person's right-click menu (see <PersonMenuItems>). */
export function PersonContextMenu({ menu, person, ...rest }: { menu: ContextMenuState; person: Person } & Omit<Parameters<typeof PersonMenuItems>[0], "person" | "anchor">) {
  return (
    <ContextMenu menu={menu} label={`${person.display_name} options`}>
      <PersonMenuItems person={person} anchor={menu.target} {...rest} />
    </ContextMenu>
  );
}
