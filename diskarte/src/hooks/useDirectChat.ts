"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteDirectMessageAction, editDirectMessageAction, sendDirectMessageAction, type DirectMessage } from "@/actions/social";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { PAGE_SIZE, type MessageAuthor } from "@/lib/messages";
import { dequeue, enqueue, isNetworkError, outboxFor, type OutboxEntry } from "@/lib/outbox";
import { playSfx } from "@/lib/sfx";
import type { ChatMessage, SendExtras, SendResult } from "./useChannelChat";

/** DM rows rendered through the channel MessageItem (no attachments, pins or threads). */
export function dmToChat(dm: DirectMessage, author: MessageAuthor | null): ChatMessage {
  return {
    id: dm.id,
    channel_id: dm.conversation_id,
    server_id: "",
    author_id: dm.author_id,
    content: dm.content,
    attachments: [],
    reply_to_id: dm.reply_to_id,
    pinned: false,
    pinned_at: null,
    pinned_by: null,
    edited_at: dm.edited_at,
    thread_id: null,
    sticker: dm.sticker,
    thread_reply_count: 0,
    thread_last_reply_at: null,
    created_at: dm.created_at,
    author,
  };
}

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
  const incoming = useRef(onIncoming);
  useEffect(() => {
    incoming.current = onIncoming;
  }, [onIncoming]);

  useEffect(() => {
    const channel = supabase
      .channel(`db:dm:${conversationId}`)
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
        if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, me.id, authorOf]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m.pending && !m.queued);
    if (!oldest || !hasMore) return;
    const { data } = await supabase.from("direct_messages").select("*").eq("conversation_id", conversationId).lt("created_at", oldest.created_at).order("created_at", { ascending: false }).limit(PAGE_SIZE + 1);
    const rows = data ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    const older = rows.slice(0, PAGE_SIZE).reverse().map((m) => dmToChat(m, authorOf(m.author_id)));
    setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
  }, [supabase, conversationId, messages, hasMore, authorOf]);

  const toMessage = useCallback(
    (entry: OutboxEntry): ChatMessage =>
      dmToChat(
        { id: entry.id, conversation_id: conversationId, author_id: me.id, content: entry.content, sticker: entry.sticker, reply_to_id: entry.replyToId, edited_at: null, created_at: entry.createdAt },
        me,
      ),
    [conversationId, me],
  );

  const deliver = useCallback(
    async (entry: OutboxEntry): Promise<SendResult> => {
      let result: Awaited<ReturnType<typeof sendDirectMessageAction>>;
      try {
        result = await sendDirectMessageAction({ id: entry.id, conversationId, content: entry.content, replyToId: entry.replyToId, sticker: entry.sticker });
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        enqueue(entry);
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...m, pending: false, queued: true } : m)));
        return "queued";
      }
      dequeue(entry.id);
      if (result.ok && result.data) {
        const saved = result.data.message;
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? dmToChat(saved, me) : m)).sort(byTime));
        return "sent";
      }
      playSfx("error");
      toast.error(result.error ?? "Hindi na-send.");
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
    async (content: string, attachments: unknown[] = [], replyToId: string | null = null, extras: SendExtras = {}): Promise<SendResult> => {
      if (attachments.length) {
        toast.error("Hindi pa pwede ang attachments sa DMs.");
        return "rejected";
      }
      const entry: OutboxEntry = { id: crypto.randomUUID(), target: conversationId, content, replyToId, threadId: null, sticker: extras.sticker ?? null, createdAt: new Date().toISOString() };
      playSfx("send");
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueue(entry);
        setMessages((prev) => [...prev, { ...toMessage(entry), queued: true }]);
        return "queued";
      }
      setMessages((prev) => [...prev, { ...toMessage(entry), pending: true }]);
      return deliver(entry);
    },
    [conversationId, toMessage, deliver],
  );

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const queue = outboxFor(conversationId);
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
  }, [conversationId, toMessage, deliver]);

  useEffect(() => {
    const queued = outboxFor(conversationId);
    if (queued.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring persisted, unsent messages
      setMessages((prev) => [...prev, ...queued.filter((e) => !prev.some((m) => m.id === e.id)).map((e) => ({ ...toMessage(e), queued: true }))].sort(byTime));
      void flush();
    }
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [conversationId, toMessage, flush]);

  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messages.find((m) => m.id === id);
      if (!before) return false;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      const result = await editDirectMessageAction({ messageId: id, content });
      if (!result.ok) {
        setMessages((prev) => prev.map((m) => (m.id === id ? before : m)));
        toast.error(result.error ?? "Hindi na-edit.");
        return false;
      }
      return true;
    },
    [messages],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = messages;
      setMessages((prev) => prev.filter((m) => m.id !== id));
      const result = await deleteDirectMessageAction({ messageId: id });
      if (!result.ok) {
        setMessages(before);
        toast.error(result.error ?? "Hindi na-delete.");
      }
    },
    [messages],
  );

  const retry = useCallback(
    (m: ChatMessage) => {
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      return send(m.content, [], m.reply_to_id, { sticker: m.sticker });
    },
    [send],
  );

  const discard = useCallback((id: string) => {
    dequeue(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { messages, hasMore, loadOlder, send, edit, remove, retry, discard, queuedCount: messages.filter((m) => m.queued).length };
}
