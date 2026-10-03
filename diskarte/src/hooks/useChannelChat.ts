"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMessageAction, editMessageAction, sendMessageAction, setPinnedAction, toggleReactionAction } from "@/actions/messages";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { AUTHOR_COLUMNS, MESSAGE_SELECT, olderThan, PAGE_SIZE, type Attachment, type Message, type MessageAuthor, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { dequeue, enqueue, isNetworkError, outboxFor, type OutboxEntry } from "@/lib/outbox";
import { subscribeDbChanges } from "@/lib/realtime";
import { playSfx } from "@/lib/sfx";

export type ChatMessage = MessageWithAuthor & { pending?: boolean; failed?: boolean; queued?: boolean };

/**
 * sent — delivered; queued — offline, will flush on reconnect; failed — kept in the list with Retry;
 * rejected — refused for a reason the user can act on (slow mode, auto-mod, verification): the
 * optimistic copy is removed so the composer can restore the draft.
 */
export type SendResult = "sent" | "queued" | "failed" | "rejected";

export interface SendExtras {
  sticker?: string | null;
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
  const [loadingOlder, setLoadingOlder] = useState(false);
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
    );
  }, [supabase, channelId, threadId, me.id, me.username, resolveAuthor]);

  // ---- pagination ----------------------------------------------------------------------
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return;
    const oldest = messages.find((m) => !m.pending && !m.queued);
    if (!oldest) return;
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
      setLoadingOlder(false);
    }
  }, [supabase, channelId, threadId, messages, hasMore, loadingOlder]);

  // ---- sending, offline outbox, slow mode -----------------------------------------------
  const slowmode = scope.slowmodeExempt ? 0 : (scope.slowmodeSeconds ?? 0);

  const toMessage = useCallback(
    (entry: OutboxEntry, attachments: Attachment[] = []): ChatMessage => ({
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
        });
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        enqueue(entry);
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...m, pending: false, queued: true } : m)));
        return "queued";
      }
      dequeue(entry.id);
      if (result.ok && result.data) {
        const saved = result.data.message;
        setMessages((prev) => prev.map((m) => (m.id === entry.id ? { ...saved, author: saved.author ?? me } : m)).sort(byTime));
        if (slowmode > 0) setCooldownUntil(Date.now() + slowmode * 1000);
        return "sent";
      }
      playSfx("error");
      toast.error(result.error ?? "Couldn't send.");
      if (result.code === "SLOWMODE" || result.code === "AUTOMOD_BLOCKED" || result.code === "VERIFICATION_REQUIRED") {
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
        id: crypto.randomUUID(),
        target: channelId,
        content,
        replyToId,
        threadId,
        sticker: extras.sticker ?? null,
        createdAt: new Date().toISOString(),
      };
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      // Attachments are uploaded files: they can't wait in the outbox, so they need a connection.
      if (offline && attachments.length === 0) {
        enqueue(entry);
        setMessages((prev) => [...prev, { ...toMessage(entry), queued: true }]);
        playSfx("send");
        return "queued";
      }
      setMessages((prev) => [...prev, { ...toMessage(entry, attachments), pending: true }]);
      playSfx("send");
      return deliver(entry, attachments);
    },
    [channelId, threadId, toMessage, deliver],
  );

  // Queued messages from a previous visit (or reload) show up and flush when online.
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const queue = outboxFor(channelId).filter((e) => e.threadId === threadId);
    if (queue.length === 0) return;
    flushing.current = true;
    try {
      for (const entry of queue) {
        setMessages((prev) => (prev.some((m) => m.id === entry.id) ? prev.map((m) => (m.id === entry.id ? { ...m, queued: false, pending: true } : m)) : [...prev, { ...toMessage(entry), pending: true }].sort(byTime)));
        if ((await deliver(entry, [])) === "queued") break;
      }
    } finally {
      flushing.current = false;
    }
  }, [channelId, threadId, toMessage, deliver]);

  useEffect(() => {
    const queued = outboxFor(channelId).filter((e) => e.threadId === threadId);
    if (queued.length) {
      // Restoring persisted, not-yet-sent messages is exactly the external sync effects are for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages((prev) => [...prev, ...queued.filter((e) => !prev.some((m) => m.id === e.id)).map((e) => ({ ...toMessage(e), queued: true }))].sort(byTime));
      void flush();
    }
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [channelId, threadId, toMessage, flush]);

  const retry = useCallback(
    async (message: ChatMessage) => {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      return send(message.content, (message.attachments as unknown as Attachment[]) ?? [], message.reply_to_id, { sticker: message.sticker });
    },
    [send],
  );

  const discard = useCallback((id: string) => {
    dequeue(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ---- edits, deletes, pins, reactions ----------------------------------------------------
  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messages.find((m) => m.id === id);
      if (!before) return false;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      const result = await editMessageAction({ messageId: id, content });
      if (!result.ok) {
        setMessages((prev) => prev.map((m) => (m.id === id ? before : m)));
        toast.error(result.error ?? "Couldn't edit.");
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
      const result = await deleteMessageAction({ messageId: id });
      if (!result.ok) {
        setMessages(before);
        toast.error(result.error ?? "Couldn't delete.");
        return false;
      }
      return true;
    },
    [messages],
  );

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned, pinned_at: pinned ? new Date().toISOString() : null } : m)));
    const result = await setPinnedAction({ messageId: id, pinned });
    if (!result.ok) {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m)));
      toast.error(result.error ?? "Couldn't pin.");
      return false;
    }
    toast.success(pinned ? "Message pinned 📌" : "Message unpinned.");
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
      const result = await toggleReactionAction({ messageId, emoji, on: !mine });
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
  };
}
