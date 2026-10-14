"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMessageAction, editMessageAction, sendMessageAction, setPinnedAction, toggleReactionAction } from "@/actions/messages";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { AUTHOR_COLUMNS, MESSAGE_SELECT, parseAttachments, olderThan, PAGE_SIZE, type Attachment, type Message, type MessageAuthor, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { dequeue, enqueue, isNetworkError, outboxFor, type OutboxEntry } from "@/lib/outbox";
import { useOutboxRetry } from "./useOutboxRetry";
import { subscribeDbChanges } from "@/lib/realtime";
import { playSfx } from "@/lib/sfx";
import { useConversationRecovery } from "./useConversationRecovery";
import { recordDiagnostic } from "@/lib/diagnostics";

export type ChatMessage = MessageWithAuthor & { pending?: boolean; failed?: boolean; queued?: boolean };

/**
 * sent — delivered; queued — offline, will flush on reconnect; failed — kept in the list with Retry;
 * rejected — refused for a reason the user can act on (slow mode, auto-mod, verification): the
 * optimistic copy is removed so the composer can restore the draft.
 */
export type SendResult = "sent" | "queued" | "failed" | "rejected";

export interface SendExtras {
  sticker?: string | null;
  /** Forum post title. */
  title?: string | null;
}

export interface ChatScope {
  /** Show one thread's replies instead of the channel's top-level messages. */
  threadId?: string | null;
  /** Channel slow mode (seconds) and whether I'm exempt (moderators). */
  slowmodeSeconds?: number;
  slowmodeExempt?: boolean;
}

function byTime(a: ChatMessage, b: ChatMessage) {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

function groupReactions(list: Reaction[]) {
  const map = new Map<string, Reaction[]>();
  for (const r of list) {
    const arr = map.get(r.message_id) ?? [];
    arr.push(r);
    map.set(r.message_id, arr);
  }
  return map;
}

export function mentionsUser(content: string, username: string) {
  return new RegExp(`(^|[^\\w.])@${username.replace(/[.]/g, "\\.")}(?![\\w.])`, "i").test(content) || /(^|\s)@(everyone|here)\b/.test(content);
}

/**
 * Live state for a text channel (or one thread in it): history + Supabase Realtime (messages &
 * reactions), optimistic send/edit/delete/pin/react, backwards pagination, an offline outbox that
 * flushes on reconnect, and the slow-mode cooldown.
 */
export function useChannelChat(
  channelId: string,
  initial: { messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean },
  scope: ChatScope = {},
) {
  const supabase = useSupabase();
  const { me } = useMe();
  const { members } = useServer();
  const threadId = scope.threadId ?? null;
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [reactions, setReactions] = useState(() => groupReactions(initial.reactions));
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const recovery = useConversationRecovery(channelId, "channel", messages, setMessages, threadId, setHasMore);
  const { status: recoveryStatus, noteDelete } = recovery;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loading = useRef(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  const authors = useRef(new Map<string, MessageAuthor>());
  useEffect(() => {
    for (const m of members) authors.current.set(m.user_id, m.profile);
  }, [members]);

  const resolveAuthor = useCallback(
    async (userId: string | null): Promise<MessageAuthor | null> => {
      if (!userId) return null;
      const cached = authors.current.get(userId);
      if (cached) return cached;
      const { data } = await supabase.from("profiles").select(AUTHOR_COLUMNS).eq("id", userId).maybeSingle();
      if (data) authors.current.set(userId, data as MessageAuthor);
      return (data as MessageAuthor | null) ?? null;
    },
    [supabase],
  );

  // ---- realtime ------------------------------------------------------------------------
  useEffect(() => {
    const inScope = (m: Message) => m.channel_id === channelId && (m.thread_id ?? null) === threadId;
    const filter = threadId ? `thread_id=eq.${threadId}` : `channel_id=eq.${channelId}`;
    return subscribeDbChanges(supabase, `chat:${channelId}${threadId ? `:${threadId}` : ""}`, (channel) =>
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, async ({ new: row }) => {
          const message = row as Message;
          if (!inScope(message)) return;
          const author = await resolveAuthor(message.author_id);
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === message.id);
            if (existing) return prev.map((m) => (m.id === message.id ? { ...message, author: m.author ?? author } : m));
            return [...prev, { ...message, author }].sort(byTime);
          });
          if (message.author_id !== me.id) playSfx(mentionsUser(message.content, me.username) ? "mention" : "message");
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, ({ new: row }) => {
          const message = row as Message;
          setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message, author: m.author } : m)));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, ({ old }) => {
          const id = (old as { id?: string }).id;
          if (!id) return;
          noteDelete(id);
          setMessages((prev) => prev.filter((m) => m.id !== id));
          setReactions((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `channel_id=eq.${channelId}` }, ({ new: row }) => {
          const r = row as Reaction;
          setReactions((prev) => {
            const list = prev.get(r.message_id) ?? [];
            if (list.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) return prev;
            const next = new Map(prev);
            next.set(r.message_id, [...list, r]);
            return next;
          });
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, ({ old }) => {
          const r = old as Partial<Reaction>;
          if (!r.message_id) return;
          setReactions((prev) => {
            const list = prev.get(r.message_id!);
            if (!list) return prev;
            const next = new Map(prev);
            next.set(
              r.message_id!,
              list.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)),
            );
            return next;
          });
        }),
      recoveryStatus,
    );
  }, [supabase, channelId, threadId, me.id, me.username, resolveAuthor, recoveryStatus, noteDelete]);

  // ---- pagination ----------------------------------------------------------------------
  const loadOlder = useCallback(async () => {
    if (loading.current || !hasMore) return;
    const oldest = messages.find((m) => !m.pending && !m.queued);
    if (!oldest) return;
    loading.current = true;
    setLoadingOlder(true);
    try {
      let query = supabase.from("messages").select(MESSAGE_SELECT).eq("channel_id", channelId).or(olderThan(oldest));
      query = threadId ? query.eq("thread_id", threadId) : query.is("thread_id", null);
      const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as MessageWithAuthor[];
      setHasMore(rows.length > PAGE_SIZE);
      const older = rows.slice(0, PAGE_SIZE).reverse();
      if (older.length) {
        const { data: r } = await supabase
          .from("reactions")
          .select("*")
          .in(
            "message_id",
            older.map((m) => m.id),
          );
        setReactions((prev) => {
          const next = new Map(prev);
          for (const [id, list] of groupReactions(r ?? [])) next.set(id, list);
          return next;
        });
        setMessages((prev) => [...older.filter((o) => !prev.some((p) => p.id === o.id)), ...prev]);
      }
    } catch {
      toast.error("Couldn't load older messages.");
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }, [supabase, channelId, threadId, messages, hasMore]);

  // ---- sending, offline outbox, slow mode -----------------------------------------------
  const slowmode = scope.slowmodeExempt ? 0 : (scope.slowmodeSeconds ?? 0);

  const toMessage = useCallback(
    (entry: OutboxEntry, attachments: Attachment[] = entry.attachments ?? []): ChatMessage => ({
      id: entry.id,
      channel_id: channelId,
      server_id: "",
      author_id: me.id,
      content: entry.content,
      attachments: attachments as unknown as Message["attachments"],
      reply_to_id: entry.replyToId,
      pinned: false,
      pinned_at: null,
      pinned_by: null,
      edited_at: null,
      thread_id: entry.threadId,
      sticker: entry.sticker,
      title: entry.title ?? null,
      thread_reply_count: 0,
      thread_last_reply_at: null,
      created_at: entry.createdAt,
      author: me,
    }),
    [channelId, me],
  );

  /** Delivers one message; resolves to what happened. Network failures leave it queued. */
  const deliver = useCallback(
    async (entry: OutboxEntry, attachments: Attachment[]): Promise<SendResult> => {
      let result: Awaited<ReturnType<typeof sendMessageAction>>;
      try {
        result = await sendMessageAction({
          id: entry.id,
          channelId,
          content: entry.content,
          attachments,
          replyToId: entry.replyToId,
          threadId: entry.threadId,
          sticker: entry.sticker,
          title: entry.title ?? null,
        });
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
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...saved, author: saved.author ?? me } : m)).sort(byTime));
        if (slowmode > 0) setCooldownUntil(Date.now() + slowmode * 1000);
        return "sent";
      }
      playSfx("error");
      recordDiagnostic("message", "failed");
      toast.error(result.error ?? "Couldn't send.");
      if (result.code === "SLOWMODE" || result.code === "AUTOMOD_BLOCKED" || result.code === "VERIFICATION_REQUIRED" || result.code === "READ_ONLY_CHANNEL" || result.code === "TIMED_OUT" || result.code === "POST_TITLE_REQUIRED") {
        if (result.code === "SLOWMODE") setCooldownUntil(Date.now() + (result.retryAfter ?? slowmode) * 1000);
        setMessages((prev) => prev.filter((m) => m.id !== entry.id));
        return "rejected";
      }
      setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...m, pending: false, queued: false, failed: true } : m)));
      return "failed";
    },
    [channelId, me, slowmode],
  );

  const send = useCallback(
    async (content: string, attachments: Attachment[] = [], replyToId: string | null = null, extras: SendExtras = {}): Promise<SendResult> => {
      const entry: OutboxEntry = {
        id: crypto.randomUUID(), userId: me.id,
        target: channelId,
        content,
        attachments,
        replyToId,
        threadId,
        sticker: extras.sticker ?? null,
        title: extras.title ?? null,
        createdAt: new Date().toISOString(),
      };
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      // Uploads have already finished; persist their paths with the text for an idempotent retry.
      if (offline) {
        const queued = enqueue(entry);
        setMessages((prev) => [...prev, { ...toMessage(entry), queued, failed: !queued }]);
        playSfx("send");
        return queued ? "queued" : "failed";
      }
      setMessages((prev) => [...prev, { ...toMessage(entry, attachments), pending: true }]);
      playSfx("send");
      return deliver(entry, attachments);
    },
    [channelId, threadId, me.id, toMessage, deliver],
  );

  // Queued messages from a previous visit (or reload) show up and flush when online.
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const queue = outboxFor(channelId, me.id).filter((e) => e.threadId === threadId);
    if (queue.length === 0) return;
    flushing.current = true;
    try {
      for (const entry of queue) {
        setMessages((prev) => (prev.some((m) => m.id === entry.id) ? prev.map((m) => (m.id === entry.id ? { ...m, queued: false, pending: true } : m)) : [...prev, { ...toMessage(entry), pending: true }].sort(byTime)));
        if ((await deliver(entry, entry.attachments ?? [])) === "queued") break;
      }
    } finally {
      flushing.current = false;
    }
  }, [channelId, threadId, me.id, toMessage, deliver]);

  useEffect(() => {
    const queued = outboxFor(channelId, me.id).filter((e) => e.threadId === threadId);
    if (queued.length) {
      // Restoring persisted, not-yet-sent messages is exactly the external sync effects are for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages((prev) => [...prev, ...queued.filter((e) => !prev.some((m) => m.id === e.id)).map((e) => ({ ...toMessage(e), queued: true }))].sort(byTime));
      void flush();
    }

  }, [channelId, threadId, me.id, toMessage, flush]);

  useOutboxRetry(flush);

  const retrying = useRef(new Set<string>());
  const retry = useCallback(async (m: ChatMessage) => {
    if (retrying.current.has(m.id)) return;
    retrying.current.add(m.id);
    const entry: OutboxEntry = { id: m.id, userId: me.id, target: channelId, content: m.content, replyToId: m.reply_to_id, threadId: m.thread_id, sticker: m.sticker, title: m.title, createdAt: m.created_at, attachments: parseAttachments(m.attachments) };
    setMessages((prev) => prev.map((row) => row.id === m.id ? { ...row, pending: true, queued: false, failed: false } : row));
    try { return await deliver(entry, entry.attachments ?? []); }
    finally { retrying.current.delete(m.id); }
  }, [channelId, me.id, deliver]);

  const discard = useCallback((id: string) => {
    dequeue(id, me.id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, [me.id]);

  // ---- edits, deletes, pins, reactions ----------------------------------------------------
  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messages.find((m) => m.id === id);
      if (!before) return false;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      const result = await editMessageAction({ messageId: id, content }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
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
      const result = await deleteMessageAction({ messageId: id }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
      if (!result.ok) {
        setMessages((prev) => before && !prev.some((m) => m.id === id) ? [...prev, before].sort(byTime) : prev);
        toast.error(result.error ?? "Couldn't delete.");
        return false;
      }
      return true;
    },
    [messages],
  );

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned, pinned_at: pinned ? new Date().toISOString() : null } : m)));
    const result = await setPinnedAction({ messageId: id, pinned }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
    if (!result.ok) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m)));
      toast.error(result.error ?? "Couldn't pin.");
      return false;
    }
    toast.success(pinned ? "Message pinned." : "Message unpinned.");
    return true;
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const mine = (reactions.get(messageId) ?? []).some((r) => r.user_id === me.id && r.emoji === emoji);
      const optimistic = (on: boolean) =>
        setReactions((prev) => {
          const list = prev.get(messageId) ?? [];
          const next = new Map(prev);
          next.set(
            messageId,
            on
              ? [...list.filter((r) => !(r.user_id === me.id && r.emoji === emoji)), { message_id: messageId, user_id: me.id, emoji, channel_id: channelId, server_id: "", created_at: new Date().toISOString() }]
              : list.filter((r) => !(r.user_id === me.id && r.emoji === emoji)),
          );
          return next;
        });
      optimistic(!mine);
      const result = await toggleReactionAction({ messageId, emoji, on: !mine }).catch(() => ({ ok: false, error: "Connection lost. Try again." }));
      if (!result.ok) {
        optimistic(mine);
        toast.error(result.error ?? "Couldn't add the reaction.");
      }
    },
    [reactions, me.id, channelId],
  );

  const pinned = useMemo(() => messages.filter((m) => m.pinned).sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "")), [messages]);
  const queuedCount = useMemo(() => messages.filter((m) => m.queued).length, [messages]);

  return {
    messages,
    reactions,
    hasMore,
    loadingOlder,
    loadOlder,
    send,
    retry,
    discard,
    edit,
    remove,
    setPinned,
    toggleReaction,
    pinned,
    queuedCount,
    cooldownUntil,
    flush,
    recovery,
  };
}
