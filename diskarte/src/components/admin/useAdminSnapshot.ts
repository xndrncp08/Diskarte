"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import type { AdminSnapshot } from "@/lib/admin";
import { subscribeDbChanges } from "@/lib/realtime";

/** Fallback refresh for things realtime doesn't carry (LiveKit rooms, sessions). */
const POLL_MS = 15_000;
/** Heartbeats arrive in bursts: coalesce them into one refetch. */
const COALESCE_MS = 800;
const SEARCH_DEBOUNCE_MS = 300;

export interface AdminSnapshotState {
  data: AdminSnapshot | null;
  error: string | null;
  loading: boolean;
  /** Whether the private `db:admin:<me>` realtime feed is joined. */
  live: boolean;
  refresh: () => void;
}

/**
 * The Control Center's data: GET /api/admin/snapshot (server-side search with `query`), refreshed
 * live whenever a device heartbeat, audit entry, account control or broadcast changes, and polled
 * as a fallback. Only fetched while the Control Center is mounted.
 */
export function useAdminSnapshot(query: string, active = true): AdminSnapshotState {
  const supabase = useSupabase();
  const { me } = useMe();
  const [data, setData] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [debounced, setDebounced] = useState(query);
  const inflight = useRef<AbortController | null>(null);
  const queued = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    try {
      const q = queryRef.current;
      const res = await fetch(`/api/admin/snapshot${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store", signal: controller.signal });
      const body = (await res.json().catch(() => null)) as (AdminSnapshot & { error?: string }) | null;
      if (controller.signal.aborted) return;
      if (!res.ok || !body || body.error) {
        setError(body?.error ?? (res.status === 403 ? "Only super admins can open the Control Center." : "The Control Center couldn't load."));
      } else {
        setData(body);
        setError(null);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("You're offline — showing the last snapshot.");
    } finally {
      if (inflight.current === controller) {
        inflight.current = null;
        setLoading(false);
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (queued.current) return;
    queued.current = setTimeout(() => {
      queued.current = null;
      void load();
    }, COALESCE_MS);
  }, [load]);

  useEffect(() => {
    queryRef.current = debounced;
    if (!active) return;
    void load();
  }, [debounced, active, load]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [active, load]);

  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeDbChanges(
      supabase,
      `admin:${me.id}`,
      (channel) =>
        channel
          .on("postgres_changes", { event: "*", schema: "public", table: "user_devices" }, schedule)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_audit_logs" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "account_controls" }, schedule)
          .on("postgres_changes", { event: "*", schema: "public", table: "system_broadcasts" }, schedule),
      (status) => setLive(status === "SUBSCRIBED"),
    );
    return () => {
      unsubscribe();
      setLive(false);
      if (queued.current) clearTimeout(queued.current);
      queued.current = null;
    };
  }, [supabase, me.id, active, schedule]);

  useEffect(() => () => inflight.current?.abort(), []);

  return { data, error, loading, live, refresh: () => void load() };
}

/** A clock for "x seconds ago" labels and presence windows (ticks every `ms`). */
export function useNow(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
