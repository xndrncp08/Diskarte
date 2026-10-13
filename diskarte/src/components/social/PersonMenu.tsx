"use client";

import { AtSign, Ban, BellRing, Gavel, MessageCircle, PencilLine, ShieldOff, UserCheck, UserMinus, UserPlus, UserRound, UserX } from "lucide-react";
import { useContext } from "react";
import { toast } from "sonner";
import { banMemberAction } from "@/actions/moderation";
import { assignRoleAction, kickMemberAction, setMemberRoleAction, setNicknameAction } from "@/actions/servers";
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
import { canManageMember, ROLE_LABEL } from "@/lib/servers";
import { friendStatus } from "@/lib/social";

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
  /** Overrides "View profile" (the member list opens its own popover). Defaults to the server profile window. */
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
  const viewProfile = onViewProfile ?? (member ? () => openMemberProfile(member.user_id, anchor) : undefined);

  function setRole(role: (typeof ROLES)[number]) {
    if (!serverCtx) return;
    void setMemberRoleAction({ serverId: serverCtx.server.id, userId: person.id, role }).then((result) =>
      result.ok ? toast.success(`${name} is now ${ROLE_LABEL[role]}.`) : toast.error(result.error ?? "Couldn't change the role."),
    );
  }

  function changeServerNickname() {
    if (!serverCtx || !member) return;
    confirmAction({
      title: self ? "Change your nickname" : `Change ${name}'s nickname`,
      body: `Everyone in ${serverCtx.server.name} sees it. Leave it empty to go back to ${self ? "your" : "their"} display name.`,
      confirmLabel: "Save",
      danger: false,
      reason: { label: "Server nickname", placeholder: person.display_name, maxLength: 32, initial: member.nickname ?? "" },
      onConfirm: async (nickname) => {
        const result = await setNicknameAction({ serverId: serverCtx.server.id, userId: person.id, nickname });
        if (!result.ok) {
          toast.error(result.fieldErrors?.nickname ?? result.error ?? "Couldn't change the nickname.");
          return false;
        }
        toast.success(nickname ? `Nickname set to ${nickname}.` : "Nickname cleared.");
      },
    });
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

  const items: MenuItem[] = [
    ...before,
    { label: "View profile", icon: <UserRound className={icon} aria-hidden />, onSelect: () => viewProfile?.(), hidden: !viewProfile },
    { label: "Message", icon: <MessageCircle className={icon} aria-hidden />, onSelect: () => void friends.message(person.id), hidden: self || !social || status === "blocked" },
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

  return <ContextMenuItems items={items} />;
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
