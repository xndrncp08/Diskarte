"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { recordDiagnostic } from "@/lib/diagnostics";
import { AUTHOR_COLUMNS, MESSAGE_SELECT, type MessageAuthor } from "@/lib/messages";
import { dmToChat } from "@/lib/direct-message";
import type { ChatMessage } from "./useChannelChat";

/** Reconcile only rows unchanged since the fetch started; preserve live edits, deletes and sends. */
export function reconcileHistory(previous: ChatMessage[], snapshot: ChatMessage[], fetched: ChatMessage[], deleted: ReadonlySet<string>) {
  const before = new Map(snapshot.map((m) => [m.id, m]));
  const current = new Map(previous.map((m) => [m.id, m]));
  const fresh = new Map(fetched.map((m) => [m.id, m]));
  const next = previous.flatMap((m) => {
    if (m.pending || m.queued || m.failed || before.get(m.id) !== m) return [m];
    const row = fresh.get(m.id);
    return row ? [row] : [];
  });
  for (const row of fresh.values()) if (!current.has(row.id) && !before.has(row.id) && !deleted.has(row.id)) next.push(row);
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function useConversationRecovery(target: string, kind: "channel" | "dm", messages: ChatMessage[], setMessages: Dispatch<SetStateAction<ChatMessage[]>>, threadId: string | null = null, setHasMore?: Dispatch<SetStateAction<boolean>>) {
  const supabase = useSupabase();
  const latest = useRef(messages);
  const deleted = useRef(new Set<string>());
  const running = useRef(false);
  const active = useRef(false);
  const [problem, setProblem] = useState(false);
  useEffect(() => { latest.current = messages; }, [messages]);
  const recover = useCallback(async () => {
    if (running.current || !active.current || !navigator.onLine) return;
    running.current = true;
    const started = performance.now();
    const snapshot = latest.current.filter((m) => !m.pending && !m.queued && !m.failed);
    try {
      const channelQuery = () => {
        const q = supabase.from("messages").select(MESSAGE_SELECT).eq("channel_id", target);
        return threadId ? q.eq("thread_id", threadId) : q.is("thread_id", null);
      };
      const dmQuery = () => supabase.from("direct_messages").select("*").eq("conversation_id", target);
      const authors = new Map<string, MessageAuthor>();
      snapshot.forEach((m) => { if (m.author_id && m.author) authors.set(m.author_id, m.author); });
      const normalizeDm = async (rows: Awaited<ReturnType<typeof dmQuery>>["data"]) => {
        const missing = [...new Set((rows ?? []).flatMap((m) => m.author_id && !authors.has(m.author_id) ? [m.author_id] : []))];
        if (missing.length) {
          const { data } = await supabase.from("profiles").select(AUTHOR_COLUMNS).in("id", missing);
          (data ?? []).forEach((p) => authors.set(p.id, p as MessageAuthor));
        }
        return (rows ?? []).map((m) => dmToChat(m, m.author_id ? authors.get(m.author_id) ?? null : null));
      };
      const fetched: ChatMessage[] = [];
      // Refresh known rows, including edits, pins and deletions missed while disconnected.
      for (let offset = 0; offset < snapshot.length; offset += 100) {
        if (!active.current) return;
        const ids = snapshot.slice(offset, offset + 100).map((m) => m.id);
        if (kind === "channel") {
          const { data, error } = await channelQuery().in("id", ids).limit(100);
          if (error) throw error;
          fetched.push(...(data ?? []) as unknown as ChatMessage[]);
        } else {
          const { data, error } = await dmQuery().in("id", ids).limit(100);
          if (error) throw error;
          fetched.push(...await normalizeDm(data));
        }
      }
      // Forward keyset pagination closes gaps even if more than one page arrived offline.
      let cursor = snapshot.at(-1);
      while (active.current) {
        const after = cursor ? `created_at.gt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.gt."${cursor.id}")` : null;
        let batch: ChatMessage[];
        if (kind === "channel") {
          let q = channelQuery(); if (after) q = q.or(after);
          const { data, error } = await q.order("created_at", { ascending: !!cursor }).order("id", { ascending: !!cursor }).limit(100);
          if (error) throw error; batch = (data ?? []) as unknown as ChatMessage[];
        } else {
          let q = dmQuery(); if (after) q = q.or(after);
          const { data, error } = await q.order("created_at", { ascending: !!cursor }).order("id", { ascending: !!cursor }).limit(100);
          if (error) throw error; batch = await normalizeDm(data);
        }
        fetched.push(...batch);
        if (!cursor && batch.length === 100) setHasMore?.(true);
        const last = batch.at(-1);
        if (!cursor || batch.length < 100 || !last || last.id === cursor.id) break;
        cursor = last;
      }
      if (!active.current) return;
      setMessages((previous) => reconcileHistory(previous, snapshot, fetched, deleted.current));
      setProblem(false); recordDiagnostic("message", "recovered", performance.now() - started);
    } catch { if (active.current) { setProblem(true); recordDiagnostic("message", "error"); } }
    finally { running.current = false; }
  }, [kind, target, threadId, setMessages, setHasMore, supabase]);
  useEffect(() => {
    active.current = true;
    const reconnect = () => void recover();
    window.addEventListener("online", reconnect);
    return () => { active.current = false; window.removeEventListener("online", reconnect); };
  }, [recover]);
  const joined = useRef(false);
  const status = useCallback((value: string) => {
    if (value === "SUBSCRIBED") { if (joined.current) void recover(); joined.current = true; }
  }, [recover]);
  const noteDelete = useCallback((id: string) => {
    deleted.current.add(id);
    if (deleted.current.size > 1000) deleted.current.delete(deleted.current.values().next().value!);
  }, []);
  return { recover, problem, status, noteDelete };
}
