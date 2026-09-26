"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Shield, ShieldCheck, UserMinus } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type RefObject } from "react";
import { toast } from "sonner";
import { kickMemberAction, setMemberRoleAction } from "@/actions/servers";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { FloatingPortal, useFloating } from "@/components/ui/floating";
import { visibleStatus, type PresencePayload } from "@/lib/presence";
import { canManageMember, ROLE_LABEL, ROLE_RANK, type MemberWithProfile } from "@/lib/servers";
import type { MemberRole } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

function RoleIcon({ role, owner }: { role: MemberRole; owner: boolean }) {
  if (owner) return <Crown className="size-3.5 text-sun" aria-label="Owner" />;
  if (role === "admin") return <ShieldCheck className="size-3.5 text-red-300" aria-label="Admin" />;
  if (role === "moderator") return <Shield className="size-3.5 text-sky-300" aria-label="Moderator" />;
  return null;
}

function MemberPopover({
  member,
  presence,
  onClose,
  anchor,
}: {
  member: MemberWithProfile;
  presence: PresencePayload | undefined;
  onClose: () => void;
  anchor: RefObject<HTMLButtonElement | null>;
}) {
  const { server, myRole } = useServer();
  const { me } = useMe();
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const { style, side } = useFloating(true, anchor, ref, { side: "left", align: "start", offset: 12 });
  const perms = canManageMember({ actorRole: myRole, actorId: me.id, target: member, ownerId: server.owner_id });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The row toggles itself; treating it as "outside" would close then instantly reopen.
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchor]);

  function setRole(role: MemberRole) {
    startTransition(async () => {
      const result = await setMemberRoleAction({ serverId: server.id, userId: member.user_id, role });
      if (result.ok) toast.success(`${member.profile.display_name} is now ${ROLE_LABEL[role]}.`);
      else toast.error(result.error ?? "Hindi napalitan ang role.");
    });
  }

  function kick() {
    startTransition(async () => {
      const result = await kickMemberAction({ serverId: server.id, userId: member.user_id });
      if (result.ok) {
        toast.success(`Na-kick si ${member.profile.display_name}.`);
        onClose();
      } else toast.error(result.error ?? "Hindi na-kick.");
    });
  }

  const status = visibleStatus(presence);
  const profile = {
    ...member.profile,
    status: status === "offline" ? ("invisible" as const) : status,
    custom_status: presence?.custom_status ?? member.profile.custom_status,
    custom_status_emoji: presence?.custom_status_emoji ?? member.profile.custom_status_emoji,
  };

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={`${member.profile.display_name}'s profile`}
      data-floating="member-popover"
      data-side={side}
      style={style}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, pointerEvents: "none" }}
      transition={{ duration: 0.15 }}
      className="z-50"
    >
      <ProfileCard
        profile={profile}
        role={member.user_id === server.owner_id ? "Owner" : ROLE_LABEL[member.role]}
        footer={
          (perms.changeRole || perms.kick) && (
            <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {perms.changeRole && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Set role">
                  {(["member", "moderator", "admin"] as const).map((role) => (
                    <button
                      key={role}
                      type="button"
                      disabled={pending || member.role === role}
                      onClick={() => setRole(role)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-default",
                        member.role === role ? "border-sun bg-sun text-abyss" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                      )}
                    >
                      {ROLE_LABEL[role]}
                    </button>
                  ))}
                </div>
              )}
              {perms.kick && (
                <Button variant="danger" size="sm" onClick={kick} loading={pending} className="w-full">
                  <UserMinus className="size-4" aria-hidden /> Kick from tambayan
                </Button>
              )}
            </div>
          )
        }
      />
    </motion.div>
  );
}

function MemberRow({ member, presence, dim }: { member: MemberWithProfile; presence: PresencePayload | undefined; dim: boolean }) {
  const { server } = useServer();
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLButtonElement>(null);
  const status = visibleStatus(presence);
  const customStatus = presence?.custom_status ?? member.profile.custom_status;
  const customEmoji = presence?.custom_status_emoji ?? member.profile.custom_status_emoji;

  return (
    <li className="relative">
      <button
        ref={row}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5", dim && "opacity-45 hover:opacity-100")}
        data-testid="member-row"
      >
        <UserAvatar profile={member.profile} size={32} status={status} ring="#0b1020" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1">
            <span className={cn("truncate text-sm font-medium", member.role === "admin" ? "text-red-200" : member.role === "moderator" ? "text-sky-200" : "text-slate-200")}>
              {member.nickname ?? member.profile.display_name}
            </span>
            <RoleIcon role={member.role} owner={member.user_id === server.owner_id} />
          </span>
          {status !== "offline" && (customStatus || customEmoji) && (
            <span className="block truncate text-[11px] text-slate-400">
              {customEmoji} {customStatus}
            </span>
          )}
        </span>
      </button>
      <FloatingPortal>
        <AnimatePresence>{open && <MemberPopover member={member} presence={presence} anchor={row} onClose={() => setOpen(false)} />}</AnimatePresence>
      </FloatingPortal>
    </li>
  );
}

export function MemberList() {
  const { members, presence, server } = useServer();

  const sorted = [...members].sort(
    (a, b) =>
      Number(b.user_id === server.owner_id) - Number(a.user_id === server.owner_id) ||
      ROLE_RANK[b.role] - ROLE_RANK[a.role] ||
      (a.nickname ?? a.profile.display_name).localeCompare(b.nickname ?? b.profile.display_name),
  );
  const online = sorted.filter((m) => visibleStatus(presence.get(m.user_id)) !== "offline");
  const offline = sorted.filter((m) => visibleStatus(presence.get(m.user_id)) === "offline");
  const groups: { label: string; list: MemberWithProfile[]; dim: boolean }[] = [];
  for (const role of ["admin", "moderator", "member"] as const) {
    const list = online.filter((m) => m.role === role);
    if (list.length) groups.push({ label: `${ROLE_LABEL[role]}s — ${list.length}`, list, dim: false });
  }
  if (offline.length) groups.push({ label: `Offline — ${offline.length}`, list: offline, dim: true });

  return (
    <aside aria-label="Members" className="glass scrollbar-thin h-full w-60 shrink-0 overflow-y-auto border-y-0 border-r-0 px-2 py-4" data-testid="member-list">
      {groups.map((group) => (
        <section key={group.label} className="mb-4">
          <h3 className="mb-1 px-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">{group.label}</h3>
          <ul className="space-y-0.5">
            {group.list.map((m) => (
              <MemberRow key={m.user_id} member={m} presence={presence.get(m.user_id)} dim={group.dim} />
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
