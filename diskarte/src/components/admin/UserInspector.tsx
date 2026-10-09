"use client";

import { ArrowLeft, Ban, Fingerprint, Headphones, LogOut, Mic, MicOff, MonitorUp, ShieldCheck, Video } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { banUserAction, overrideStatusAction, revokeSessionsAction, setRoleAction, unbanUserAction } from "@/actions/admin";
import { useMe } from "@/components/providers/MeProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmHost";
import {
  BAN_DURATIONS,
  isBanned,
  liveDevices,
  PLATFORM_ROLE_LABEL,
  PLATFORM_ROLES,
  presenceOf,
  type AdminSnapshot,
  type AdminUser,
  type PlatformRole,
} from "@/lib/admin";
import { PRESENCE_OPTIONS, STATUS_TRIGGERS } from "@/lib/profile";
import type { PresenceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { formatAbsolute, formatAgo, formatBanUntil, formatDate, formatDuration } from "./format";
import { PresencePill, RoleBadge, SectionLabel, Segmented, SELECT } from "./primitives";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-silk text-[9px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm tabular-nums text-slate-200">{children}</dd>
    </div>
  );
}

function useAdminAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const result = await fn();
        if (result.ok) {
          toast.success(success);
          after?.();
        } else toast.error(result.error ?? "That didn't work. Try again.");
        resolve(result.ok);
      }),
    );
  return { pending, run };
}

/** Detail sheet for one account: identity, sessions, devices, live stage, and every moderation control. */
export function UserInspector({ user, snapshot, now, onClose, onChanged }: { user: AdminUser; snapshot: AdminSnapshot; now: number; onClose: () => void; onChanged: () => void }) {
  const { me } = useMe();
  const self = user.id === me.id;
  const presence = presenceOf(user, now);
  const banned = isBanned(user, now);
  const devices = user.devices;
  const live = new Set(liveDevices(user, now).map((d) => d.device_id));
  const stage = snapshot.voice.rooms.flatMap((r) => r.participants.filter((p) => p.identity === user.id).map((p) => ({ room: r, p })))[0];
  const { pending, run } = useAdminAction();

  const [status, setStatus] = useState<PresenceStatus>(user.status);
  const [custom, setCustom] = useState(user.custom_status ?? "");
  const [banHours, setBanHours] = useState<string>("24");

  const changeRole = (role: PlatformRole) => {
    if (role === user.role) return;
    const go = () => run(() => setRoleAction({ userId: user.id, role }), `${user.display_name} is now ${role === "member" ? "a Standard Member" : `a ${PLATFORM_ROLE_LABEL[role]}`}.`, onChanged);
    if (role === "super_admin") {
      confirmAction({
        title: `Make ${user.display_name} a Super Admin?`,
        body: "Super admins can broadcast to everyone, change roles, revoke sessions and ban accounts.",
        confirmLabel: "Promote",
        onConfirm: go,
      });
    } else void go();
  };

  const applyStatus = () =>
    run(() => overrideStatusAction({ userId: user.id, status, customStatus: custom.trim() || null }), "Status override sent — their canvas updates now.", onChanged);

  const revoke = () =>
    confirmAction({
      title: `Sign ${user.display_name} out everywhere?`,
      body: "Every session ends now; open canvases sign out within seconds. They can sign in again unless banned.",
      confirmLabel: "Revoke sessions",
      danger: true,
      onConfirm: () => run(() => revokeSessionsAction({ userId: user.id }), "Sessions revoked.", onChanged),
    });

  const ban = () => {
    const hours = banHours === "permanent" ? null : Number(banHours);
    const label = BAN_DURATIONS.find((d) => String(d.hours ?? "permanent") === banHours)?.label ?? "";
    confirmAction({
      title: hours === null ? `Permanently ban ${user.display_name}?` : `Ban ${user.display_name} for ${label}?`,
      body: "They're signed out everywhere and can't sign in or post until the ban ends. This is logged in the audit trail.",
      confirmLabel: "Ban account",
      danger: true,
      reason: { label: "Reason (shown to them)", placeholder: "e.g. Spamming #global-lounge", maxLength: 300 },
      onConfirm: (reason) => run(() => banUserAction({ userId: user.id, hours, reason }), `${user.display_name} is banned.`, onChanged),
    });
  };

  const unban = () => run(() => unbanUserAction({ userId: user.id }), `${user.display_name} can sign in again.`, onChanged);

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={`Inspector: ${user.display_name}`} data-testid="user-inspector">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-2 py-1.5">
        <button type="button" onClick={onClose} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Back to roster">
          <ArrowLeft className="size-4" aria-hidden /> Roster
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <header className="flex items-center gap-3">
          <UserAvatar profile={user} size={48} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate text-base font-bold text-white">{user.display_name}</span>
              <RoleBadge role={user.role} />
            </p>
            <p className="truncate text-xs text-slate-400">
              @{user.username}
              {user.email && <span className="font-mono text-slate-500"> · {user.email}</span>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <PresencePill state={presence.state} invisible={presence.invisible} />
              {user.custom_status && <span className="truncate text-xs text-slate-500">“{user.custom_status}”</span>}
            </div>
          </div>
        </header>

        {banned && (
          <p className="flex items-start gap-2 rounded-xl border border-signal-dnd/40 bg-signal-dnd/10 px-3 py-2 text-sm text-red-200" role="status">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Banned {formatBanUntil(user.banned_until)}
              {user.ban_reason && <span className="block text-xs text-red-300/80">Reason: {user.ban_reason}</span>}
            </span>
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 @md:grid-cols-4">
          <Fact label="Joined">{formatDate(user.created_at)}</Fact>
          <Fact label="Last sign-in">{formatAgo(user.last_sign_in_at, now)}</Fact>
          <Fact label="Last active">{formatAgo(user.last_seen_at, now)}</Fact>
          <Fact label="Sessions">{user.sessions}</Fact>
        </dl>

        <section aria-labelledby="stage-heading" className="space-y-1.5">
          <SectionLabel id="stage-heading">Voice stage</SectionLabel>
          {stage ? (
            <div className="flex items-center gap-3 rounded-xl border border-neon/30 bg-neon/[0.06] px-3 py-2 text-sm">
              <Headphones className="size-4 shrink-0 text-neon" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-slate-200">{stage.room.label}</span>
              <span className="flex items-center gap-1.5 text-slate-400">
                {stage.p.micLive ? <Mic className="size-3.5 text-signal-green" aria-label="Mic live" /> : <MicOff className="size-3.5" aria-label="Muted" />}
                {stage.p.camera && <Video className="size-3.5" aria-label="Camera on" />}
                {stage.p.screen && <MonitorUp className="size-3.5" aria-label="Sharing screen" />}
              </span>
              <span className="text-xs tabular-nums text-slate-400" title="Connected for">
                {formatDuration(stage.p.joinedAt, now)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Not connected to a LiveKit stage.</p>
          )}
        </section>

        <section aria-labelledby="devices-heading" className="space-y-1.5">
          <SectionLabel id="devices-heading">Devices · {devices.length}</SectionLabel>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">No devices have checked in.</p>
          ) : (
            <ul className="space-y-1">
              {devices.map((d) => (
                <li key={d.device_id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <Fingerprint className={cn("size-4 shrink-0", live.has(d.device_id) ? "text-signal-green" : "text-slate-600")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{d.label || "Unknown device"}</span>
                    <span className="block truncate font-mono text-[11px] tabular-nums text-slate-500" title={d.fingerprint}>
                      {d.fingerprint.slice(0, 16)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-slate-400" title={formatAbsolute(d.last_seen_at)}>
                    {live.has(d.device_id) ? "Connected" : formatAgo(d.last_seen_at, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="role-heading" className="space-y-1.5">
          <SectionLabel id="role-heading" className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden /> Role
          </SectionLabel>
          <Segmented
            label="Platform role"
            value={user.role}
            disabled={self || pending}
            onChange={changeRole}
            options={PLATFORM_ROLES.map((r) => ({ value: r, label: PLATFORM_ROLE_LABEL[r] }))}
          />
          {self && <p className="text-xs text-slate-500">You can&apos;t change your own role.</p>}
        </section>

        <section aria-labelledby="status-heading" className="space-y-2">
          <SectionLabel id="status-heading">Force status</SectionLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            <select aria-label="Presence" className={SELECT} value={status} onChange={(e) => setStatus(e.target.value as PresenceStatus)}>
              {PRESENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Custom status"
              value={custom}
              maxLength={64}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom status (empty clears it)"
              className={cn(SELECT, "min-w-0 flex-1 px-2.5")}
            />
            <Button size="sm" variant="secondary" onClick={applyStatus} loading={pending}>
              Apply
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_TRIGGERS.slice(0, 4).map((t) => (
              <button
                key={t.text}
                type="button"
                onClick={() => {
                  setCustom(t.text);
                  setStatus(t.status);
                }}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 hover:border-white/20 hover:text-white"
              >
                {t.text}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustom("");
                setStatus("online");
              }}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 hover:border-white/20 hover:text-white"
            >
              Reset to Online
            </button>
          </div>
        </section>

        <section aria-labelledby="moderation-heading" className="space-y-2 rounded-2xl border border-signal-dnd/20 bg-signal-dnd/[0.04] p-3">
          <SectionLabel id="moderation-heading" className="text-red-300/80">
            Moderation
          </SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={revoke} disabled={self || pending}>
              <LogOut className="size-3.5" aria-hidden /> Revoke sessions
            </Button>
            {banned ? (
              <Button size="sm" variant="secondary" onClick={unban} disabled={pending} loading={pending}>
                Lift ban
              </Button>
            ) : (
              <span className="flex items-center gap-1.5">
                <select aria-label="Ban length" className={SELECT} value={banHours} onChange={(e) => setBanHours(e.target.value)} disabled={self || user.role === "super_admin"}>
                  {BAN_DURATIONS.map((d) => (
                    <option key={d.label} value={String(d.hours ?? "permanent")}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="danger" onClick={ban} disabled={self || pending || user.role === "super_admin"}>
                  <Ban className="size-3.5" aria-hidden /> Ban
                </Button>
              </span>
            )}
          </div>
          {user.role === "super_admin" && !self && <p className="text-xs text-slate-500">Demote a super admin before banning them.</p>}
        </section>
      </div>
    </div>
  );
}
