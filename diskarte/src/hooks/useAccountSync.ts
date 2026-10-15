"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { subscribeDbChanges } from "@/lib/realtime";
import type { Json, Tables } from "@/lib/supabase/database.types";

type State = Tables<"account_state">;
type Version = { revision: number; dirty: boolean };
function version(key: string): Version {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "null"); if (Number.isSafeInteger(v?.revision) && v.revision >= 0) return { revision: v.revision, dirty: v.dirty === true }; } catch { /* memory only */ }
  return { revision: 0, dirty: false };
}

// Postgres jsonb reorders object keys; key order must never count as a settings edit.
function encode(value: Json) {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}

/** A revision conflict never replaces local edits. The caller explicitly chooses a version. */
export function useAccountSync(userId: string, key: string, value: Json, apply: (value: Json) => void, enabled = true) {
  const supabase = useOptionalSupabase();
  const metaKey = `diskarte:sync:${userId}:${key}`;
  const latest = useRef(value);
  const applyRef = useRef(apply);
  const scope = useRef<object | null>(null);
  const meta = useRef<Version>({ revision: 0, dirty: false });
  const baseline = useRef(encode(value));
  const writing = useRef<{ encoded: string; revision: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState<{ scope: string; value: string } | null>(null);
  const [problem, setProblem] = useState("");
  const [conflict, setConflict] = useState<State | null>(null);
  const [cycle, setCycle] = useState(0);
  const [retry, setRetry] = useState(0);
  const encoded = encode(value);
  useEffect(() => { latest.current = value; applyRef.current = apply; }, [value, apply]);
  const persist = useCallback(() => {
    try { localStorage.setItem(metaKey, JSON.stringify(meta.current)); } catch { /* memory only */ }
  }, [metaKey]);

  useEffect(() => {
    if (!supabase || !enabled) return;
    const token = {}; scope.current = token;
    meta.current = version(metaKey); writing.current = null;
    if (key.startsWith("draft:") && meta.current.revision === 0 && latest.current) meta.current.dirty = true;
    baseline.current = encode(latest.current);
    let loaded = false;
    const receive = (row: State) => {
      if (scope.current !== token || row.key !== key || row.user_id !== userId || row.revision < meta.current.revision) return;
      const remote = encode(row.value), local = encode(latest.current);
      setAcknowledged({ scope: `${userId}:${key}`, value: remote });
      const ownWrite = writing.current && row.revision === writing.current.revision + 1 && remote === writing.current.encoded;
      if (local === remote || ownWrite) {
        meta.current = { revision: row.revision, dirty: local !== remote }; baseline.current = remote;
        persist(); setConflict(null); setProblem(""); setCycle((n) => n + 1); return;
      }
      const changed = meta.current.dirty || local !== baseline.current;
      if (changed && row.revision !== meta.current.revision) { setConflict(row); setProblem("This was changed on another device. Your local edits are still here."); return; }
      meta.current.revision = row.revision;
      if (!changed) { baseline.current = remote; applyRef.current(row.value); latest.current = row.value; }
      persist(); setCycle((n) => n + 1);
    };
    const load = async () => {
      try {
        const { data, error } = await supabase.from("account_state").select("*").eq("user_id", userId).eq("key", key).maybeSingle();
        if (scope.current !== token) return;
        if (error) throw error;
        if (data) receive(data);
        else if (!loaded) {
          // Import an existing local draft/preferences only when no account copy exists.
          // Untouched empty drafts need no row; an existing dirty clear still needs its tombstone.
          meta.current.dirty ||= !key.startsWith("draft:") || latest.current !== "";
          persist();
        }
        loaded = true; setReady(true); setCycle((n) => n + 1);
      } catch (error) {
        if (scope.current !== token) return;
        const code = error && typeof error === "object" && "code" in error ? error.code : "";
        setProblem(["PGRST205", "PGRST202", "42P01"].includes(String(code)) ? "Device sync needs the account-state database migration. Your changes are saved in this browser." : "Device sync is offline. Your changes are saved in this browser.");
      }
    };
    void load();
    const off = subscribeDbChanges(supabase, `account:${userId}:state:${key}`, (channel) => channel.on("postgres_changes", { event: "*", schema: "public", table: "account_state", filter: `user_id=eq.${userId}` }, ({ new: row }) => receive(row as State)), (status) => { if (status === "SUBSCRIBED") void load(); });
    window.addEventListener("online", load);
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { scope.current = null; off(); window.removeEventListener("online", load); document.removeEventListener("visibilitychange", visible); };
  }, [supabase, userId, key, enabled, metaKey, persist, retry]);

  useEffect(() => {
    if (!supabase || !enabled) return;
    if (encoded !== baseline.current) { meta.current.dirty = true; persist(); }
    if (!ready || conflict) return;
    if (!meta.current.dirty) return;
    const timer = setTimeout(async () => {
      if (writing.current || !navigator.onLine) return;
      const token = scope.current;
      const operation = { encoded, revision: meta.current.revision }; writing.current = operation;
      let saved = false;
      try {
        const { data, error } = await supabase.rpc("save_account_state", { p_key: key, p_value: JSON.parse(encoded), p_revision: operation.revision });
        if (scope.current !== token) return;
        if (error || !data?.[0]) {
          if (error?.code === "40001") { setReady(false); setRetry((n) => n + 1); }
          throw error;
        }
        if (data[0].revision < meta.current.revision) return;
        baseline.current = operation.encoded;
        setAcknowledged({ scope: `${userId}:${key}`, value: operation.encoded });
        meta.current = { revision: data[0].revision, dirty: encode(latest.current) !== operation.encoded };
        persist(); setProblem(""); saved = true;
      } catch { if (scope.current === token) setProblem("Device sync couldn’t save. Your local changes are preserved; retry when connected."); }
      finally { if (scope.current === token) { writing.current = null; if (saved) setCycle((n) => n + 1); } }
    }, 700);
    return () => clearTimeout(timer);
  }, [encoded, ready, conflict, cycle, supabase, userId, key, enabled, persist]);

  const resolve = useCallback((remote: boolean) => {
    if (!conflict) return;
    meta.current = { revision: conflict.revision, dirty: !remote };
    baseline.current = encode(conflict.value);
    if (remote) { latest.current = conflict.value; applyRef.current(conflict.value); }
    persist(); setConflict(null); setProblem(""); setCycle((n) => n + 1);
  }, [conflict, persist]);
  return { pending: enabled && (!ready || !!conflict || acknowledged?.scope !== `${userId}:${key}` || acknowledged.value !== encoded), problem: enabled ? problem : "", conflict, useRemote: () => resolve(true), keepLocal: () => resolve(false), retry: () => { setReady(false); setRetry((n) => n + 1); } };
}
