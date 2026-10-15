"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteDirectMessageAction, editDirectMessageAction, sendDirectMessageAction, type DirectMessage } from "@/actions/social";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { parseAttachments, olderThan, PAGE_SIZE, type Attachment, type MessageAuthor } from "@/lib/messages";
import { dequeue, enqueue, isNetworkError, outboxFor, type OutboxEntry } from "@/lib/outbox";
import { useOutboxRetry } from "./useOutboxRetry";
import { subscribeDbChanges } from "@/lib/realtime";
import { playSfx } from "@/lib/sfx";
import type { ChatMessage, SendExtras, SendResult } from "./useChannelChat";
import { dmToChat } from "@/lib/direct-message";
import { useConversationRecovery } from "./useConversationRecovery";
import { recordDiagnostic } from "@/lib/diagnostics";
export { dmToChat } from "@/lib/direct-message";

const byTime = (a: ChatMessage, b: ChatMessage) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** Live DM conversation: realtime, optimistic send/edit/delete, offline outbox, pagination. */
export function useDirectChat(conversationId: string, initial: { messages: DirectMessage[]; hasMore: boolean }, people: MessageAuthor[], onIncoming?: () => void) {
  const supabase = useSupabase();
  const { me } = useMe();
  const authors = useRef(new Map<string, MessageAuthor>([...people.map((p) => [p.id, p] as const), [me.id, me]]));
  const authorOf = useCallback((id: string | null) => (id ? (authors.current.get(id) ?? null) : null), []);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const known = new Map<string, MessageAuthor>([...people.map((p) => [p.id, p] as const), [me.id, me]]);
    return initial.messages.map((m) => dmToChat(m, m.author_id ? (known.get(m.author_id) ?? null) : null));
  });
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const recovery = useConversationRecovery(conversationId, "dm", messages, setMessages, null, setHasMore);
  const { status: recoveryStatus, noteDelete } = recovery;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loading = useRef(false);
  const incoming = useRef(onIncoming);
  useEffect(() => {
    incoming.current = onIncoming;
  }, [onIncoming]);

  useEffect(() => {
    return subscribeDbChanges(supabase, `dm:${conversationId}`, (channel) =>
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) => {
          const dm = row as DirectMessage;
          setMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev.map((m) => (m.id === dm.id ? { ...dmToChat(dm, m.author) } : m)) : [...prev, dmToChat(dm, authorOf(dm.author_id))].sort(byTime)));
          if (dm.author_id !== me.id) {
            playSfx("message");
            incoming.current?.();
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages", filter: `conversation_id=eq.${conversationId}` }, ({ new: row }) => {
          const dm = row as DirectMessage;
          setMessages((prev) => prev.map((m) => (m.id === dm.id ? dmToChat(dm, m.author) : m)));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, ({ old }) => {
          const id = (old as { id?: string }).id;
          if (id) { noteDelete(id); setMessages((prev) => prev.filter((m) => m.id !== id)); }
        }),
      recoveryStatus,
    );
  }, [supabase, conversationId, me.id, authorOf, recoveryStatus, noteDelete]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending && !m.queued);
    if (!oldest || !hasMore || loading.current) return;
    loading.current = true;
    setLoadingOlder(true);
    try {
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .or(olderThan(oldest))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) throw error;
    const rows = data ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    const older = rows.slice(0, PAGE_SIZE).reverse().map((m) => dmToChat(m, authorOf(m.author_id)));
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
    } catch { toast.error("Couldn't load older messages. Try again."); }
    finally { loading.current = false; setLoadingOlder(false); }
  }, [supabase, conversationId, messages, hasMore, authorOf]);

  const toMessage = useCallback(
    (entry: OutboxEntry): ChatMessage =>
      dmToChat(
        { id: entry.id, conversation_id: conversationId, author_id: me.id, content: entry.content, attachments: (entry.attachments ?? []).map((a) => ({ ...a })), sticker: entry.sticker, reply_to_id: entry.replyToId, edited_at: null, created_at: entry.createdAt },
        me,
      ),
    [conversationId, me],
  );

  const deliver = useCallback(
    async (entry: OutboxEntry): Promise<SendResult> => {
      let result: Awaited<ReturnType<typeof sendDirectMessageAction>>;
      try {
        result = await sendDirectMessageAction({ id: entry.id, conversationId, content: entry.content, attachments: entry.attachments, replyToId: entry.replyToId, sticker: entry.sticker });
      } catch (err) {
        const queued = isNetworkError(err) && enqueue(entry);
        if (!queued) recordDiagnostic("message", "failed");
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...m, pending: false, queued, failed: !queued } : m)));
        if (!queued) toast.error("Couldn't send. Your message is available to retry.");
        return queued ? "queued" : "failed";
      }
      dequeue(entry.id, me.id);
      if (result.ok && result.data) {
        const saved = result.data.message;
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? dmToChat(saved, me) : m)).sort(byTime));
        return "sent";
      }
      playSfx("error");
      recordDiagnostic("message", "failed");
      toast.error(result.error ?? "Couldn't send.");
      if (result.code === "AUTOMOD_BLOCKED" || result.code === "DM_NOT_ALLOWED") {
        setMessages((prev) => prev.filter((m) => m.id !== entry.id));
        return "rejected";
      }
      setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...m, pending: false, queued: false, failed: true } : m)));
      return "failed";
    },
    [conversationId, me],
  );

  const send = useCallback(
    async (content: string, attachments: Attachment[] = [], replyToId: string | null = null, extras: SendExtras = {}): Promise<SendResult> => {
      const entry: OutboxEntry = { id: crypto.randomUUID(), userId: me.id, target: conversationId, content, attachments, replyToId, threadId: null, sticker: extras.sticker ?? null, createdAt: new Date().toISOString() };
      playSfx("send");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const queued = enqueue(entry);
        setMessages((prev) => [...prev, { ...toMessage(entry), queued, failed: !queued }]);
        return queued ? "queued" : "failed";
      }
      setMessages((prev) => [...prev, { ...toMessage(entry), pending: true }]);
      return deliver(entry);
    },
    [conversationId, me.id, toMessage, deliver],
  );

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const queue = outboxFor(conversationId, me.id);
    if (!queue.length) return;
    flushing.current = true;
    try {
      for (const entry of queue) {
        setMessages((prev) => (prev.some((m) => m.id === entry.id) ? prev.map((m) => (m.id === entry.id ? { ...m, queued: false, pending: true } : m)) : [...prev, { ...toMessage(entry), pending: true }].sort(byTime)));
        if ((await deliver(entry)) === "queued") break;
      }
    } finally {
      flushing.current = false;
    }
  }, [conversationId, me.id, toMessage, deliver]);

  useEffect(() => {
    const queued = outboxFor(conversationId, me.id);
    if (queued.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted, unsent messages
      setMessages((prev) => [...prev, ...queued.filter((e) => !prev.some((m) => m.id === e.id)).map((e) => ({ ...toMessage(e), queued: true }))].sort(byTime));
      void flush();
    }

  }, [conversationId, me.id, toMessage, flush]);

  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messages.find((m) => m.id === id);
      if (!before) return false;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      const result = await editDirectMessageAction({ messageId: id, content }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
      if (!result.ok) {
        setMessages((prev) => prev.map((m) => (m.id === id && m.content === content ? before : m)));
        toast.error(result.error ?? "Couldn't edit.");
        return false;
      }
      return true;
    },
    [messages],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = messages.find((m) => m.id === id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
      const result = await deleteDirectMessageAction({ messageId: id }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
      if (!result.ok) {
        setMessages((prev) => before && !prev.some((m) => m.id === id) ? [...prev, before].sort(byTime) : prev);
        toast.error(result.error ?? "Couldn't delete.");
      }
    },
    [messages],
  );

  useOutboxRetry(flush);

  const retrying = useRef(new Set<string>());
  const retry = useCallback(async (m: ChatMessage) => {
    if (retrying.current.has(m.id)) return;
    retrying.current.add(m.id);
    const entry: OutboxEntry = { id: m.id, userId: me.id, target: conversationId, content: m.content, replyToId: m.reply_to_id, threadId: m.thread_id, sticker: m.sticker, title: m.title, createdAt: m.created_at, attachments: parseAttachments(m.attachments) };
    setMessages((prev) => prev.map((row) => row.id === m.id ? { ...row, pending: true, queued: false, failed: false } : row));
    try { return await deliver(entry); }
    finally { retrying.current.delete(m.id); }
  }, [conversationId, me.id, deliver]);

  const discard = useCallback((id: string) => {
    dequeue(id, me.id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, [me.id]);

  return { messages, hasMore, loadingOlder, loadOlder, send, edit, remove, retry, discard, recovery, queuedCount: messages.filter((m) => m.queued).length };
}
