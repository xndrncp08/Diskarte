"use client";

import { useEffect, useRef } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { usePresenceRejoin } from "@/components/providers/PresenceProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useCall } from "@/components/voice/CallProvider";
import { deviceFingerprint, deviceLabel, getDeviceId } from "@/lib/device";
import { clearOutbox } from "@/lib/outbox";
import { clearDrafts } from "@/lib/drafts";
import { clearLocalPush } from "@/lib/push-client";
import { subscribeDbChanges } from "@/lib/realtime";
import type { PresenceStatus } from "@/lib/supabase/database.types";

/** Heartbeats keep this browser "online" in the presence inspector (offline after 2 missed minutes). */
export const HEARTBEAT_MS = 30_000;

interface Verdict {
  signOut?: boolean;
  reason?: "banned" | "revoked";
  banReason?: string | null;
  statusOverride?: { status: PresenceStatus; custom_status: string | null } | null;
  statusOverrideAt?: string | null;
  /** My real status: the private Invisible flag (and when it last changed) and the public status. */
  invisible?: boolean;
  invisibleAt?: string | null;
  status?: PresenceStatus;
}

interface AccountControlsRow {
  banned_until: string | null;
  ban_reason: string | null;
  sessions_revoked_at: string | null;
  status_override: { status: PresenceStatus; custom_status: string | null } | null;
  status_override_at: string | null;
}

function signOutMessage(reason: Verdict["reason"], banReason?: string | null) {
  if (reason === "banned") return banReason ? `Your account is suspended: ${banReason}` : "Your account is suspended.";
  return "You were signed out by a Diskarte admin. Sign in again to continue.";
}

/**
 * Keeps this browser's entry in the presence inspector fresh (status, voice channel, device
 * fingerprint) and enforces the Control Center's account actions on an open canvas right away:
 * a ban or a session revocation signs this tab out, a status override is adopted. The heartbeat
 * reply covers missed realtime events; the private `db:account:<me>` topic makes it instant.
 */
export function SessionGuard() {
  const supabase = useSupabase();
  const { me, setMe } = useMe();
  const rejoinPresence = usePresenceRejoin();
  const call = useCall();
  const loadedAt = useRef(0);
  const ended = useRef(false);
  const voice = call.status === "connected" && call.target && call.target.kind !== "dm" ? call.target.channelId : null;
  const state = useRef({ status: me.status, custom: me.custom_status, voice });
  /** When this tab last chose (or adopted) its status: older server news about Invisible is ignored. */
  const statusAt = useRef(0);

  useEffect(() => {
    state.current = { status: me.status, custom: me.custom_status, voice };
  }, [me.status, me.custom_status, voice]);

  useEffect(() => {
    statusAt.current = Date.now();
  }, [me.status]);

  useEffect(() => {
    loadedAt.current = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fingerprint: Promise<string> | null = null;
    const label = deviceLabel(navigator.userAgent);

    const end = async (reason: Verdict["reason"], banReason?: string | null) => {
      if (ended.current) return;
      ended.current = true;
      clearOutbox();
      clearDrafts();
      await clearLocalPush().catch(() => undefined);
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      // A full page load on purpose: it drops every piece of signed-in client state (the call included).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?error=${encodeURIComponent(signOutMessage(reason, banReason))}`);
    };

    const adoptOverride = (override: Verdict["statusOverride"], at: string | null | undefined) => {
      if (!override || !at || Date.parse(at) <= loadedAt.current) return;
      loadedAt.current = Date.parse(at);
      setMe((prev) => ({ ...prev, status: override.status, custom_status: override.custom_status, custom_status_emoji: null }));
    };

    // Invisible chosen or left in another tab: follow it, so this tab stops (or resumes) publishing presence.
    const adoptInvisible = (verdict: Verdict) => {
      if (typeof verdict.invisible !== "boolean" || !verdict.invisibleAt || Date.parse(verdict.invisibleAt) <= statusAt.current) return;
      if (verdict.invisible === (state.current.status === "invisible")) return;
      statusAt.current = Date.parse(verdict.invisibleAt);
      const status = verdict.invisible ? "invisible" : (verdict.status ?? "online");
      setMe((prev) => ({ ...prev, status }));
      if (!verdict.invisible) rejoinPresence();
    };

    const beat = async () => {
      if (cancelled || ended.current) return;
      fingerprint ??= deviceFingerprint();
      const { status, custom, voice } = state.current;
      const { data, error } = await supabase.rpc("heartbeat_device", {
        p_device_id: getDeviceId(),
        p_fingerprint: await fingerprint,
        p_label: label,
        p_status: status,
        p_custom_status: custom,
        p_voice_channel_id: voice,
      });
      if (cancelled || error || !data) return;
      const verdict = data as Verdict;
      if (verdict.signOut) return end(verdict.reason, verdict.banReason);
      adoptOverride(verdict.statusOverride, verdict.statusOverrideAt);
      adoptInvisible(verdict);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await beat().catch(() => undefined);
        if (!cancelled) schedule();
      }, HEARTBEAT_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat().catch(() => undefined);
    };

    void beat().catch(() => undefined);
    schedule();
    document.addEventListener("visibilitychange", onVisible);

    const unsubscribe = subscribeDbChanges(supabase, `account:${me.id}`, (channel) =>
      channel.on("postgres_changes", { event: "*", schema: "public", table: "account_controls", filter: `user_id=eq.${me.id}` }, ({ new: row }) => {
        const c = row as Partial<AccountControlsRow>;
        if (c.banned_until && (c.banned_until === "infinity" || Date.parse(c.banned_until) > Date.now())) return void end("banned", c.ban_reason);
        if (c.sessions_revoked_at && Date.parse(c.sessions_revoked_at) > loadedAt.current) return void end("revoked");
        adoptOverride(c.status_override ?? null, c.status_override_at);
      }),
    );

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [supabase, me.id, setMe, rejoinPresence]);

  // A status or voice change is news for the inspector: report it now rather than at the next beat.
  useEffect(() => {
    if (loadedAt.current === 0) return;
    const t = setTimeout(() => {
      void (async () => {
        const { status, custom, voice: v } = state.current;
        await supabase.rpc("heartbeat_device", {
          p_device_id: getDeviceId(),
          p_fingerprint: await deviceFingerprint(),
          p_label: deviceLabel(navigator.userAgent),
          p_status: status,
          p_custom_status: custom,
          p_voice_channel_id: v,
        });
      })().catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [supabase, me.status, me.custom_status, voice]);

  return null;
}
