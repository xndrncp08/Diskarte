"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteMessageAction, editMessageAction, sendMessageAction, setPinnedAction, toggleReactionAction } from "@/actions/messages";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { AUTHOR_COLUMNS, MESSAGE_SELECT, PAGE_SIZE, type Attachment, type Message, type MessageAuthor, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { playSfx } from "@/lib/sfx";

export type ChatMessage = MessageWithAuthor & { pending?: boolean; failed?: boolean };

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
 * Live state for a text channel: history + Supabase Realtime (messages & reactions), optimistic
 * send/edit/delete/pin/react, and backwards pagination.
 */
export function useChannelChat(channelId: string, initial: { messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const { members } = useServer();
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [reactions, setReactions] = useState(() => groupReactions(initial.reactions));
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);

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
    const channel = supabase
      .channel(`db:chat:${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, async ({ new: row }) => {
        const message = row as Message;
        const author = await resolveAuthor(message.author_id);
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === message.id);
          if (existing) return prev.map((m) => (m.id === message.id ? { ...message, author: m.author ?? author } : m));
          return [...prev, { ...message, author }].sort(byTime);
        });
        if (message.author_id !== me.id) playSfx(mentionsUser(message.content, me.username) ? "mention" : "message");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, ({ new: row }) => {
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
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, channelId, me.id, me.username, resolveAuthor]);

  // ---- pagination ----------------------------------------------------------------------
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return;
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);
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
      toast.error("Hindi ma-load ang mas lumang messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [supabase, channelId, messages, hasMore, loadingOlder]);

  // ---- mutations -----------------------------------------------------------------------
  const send = useCallback(
    async (content: string, attachments: Attachment[] = [], replyToId: string | null = null) => {
      const id = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id,
        channel_id: channelId,
        server_id: "",
        author_id: me.id,
        content,
        attachments: attachments as unknown as Message["attachments"],
        reply_to_id: replyToId,
        pinned: false,
        pinned_at: null,
        pinned_by: null,
        edited_at: null,
        created_at: new Date().toISOString(),
        author: me,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      playSfx("send");
      const result = await sendMessageAction({ id, channelId, content, attachments, replyToId });
      if (!result.ok || !result.data) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)));
        playSfx("error");
        toast.error(result.error ?? "Hindi na-send.");
        return false;
      }
      const saved = result.data.message;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...saved, author: saved.author ?? me } : m)).sort(byTime));
      return true;
    },
    [channelId, me],
  );

  const retry = useCallback(
    async (message: ChatMessage) => {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      return send(message.content, (message.attachments as unknown as Attachment[]) ?? [], message.reply_to_id);
    },
    [send],
  );

  const discard = useCallback((id: string) => setMessages((prev) => prev.filter((m) => m.id !== id)), []);

  const edit = useCallback(
    async (id: string, content: string) => {
      const before = messages.find((m) => m.id === id);
      if (!before) return false;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content, edited_at: new Date().toISOString() } : m)));
      const result = await editMessageAction({ messageId: id, content });
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
      const result = await deleteMessageAction({ messageId: id });
      if (!result.ok) {
        setMessages(before);
        toast.error(result.error ?? "Hindi na-delete.");
        return false;
      }
      return true;
    },
    [messages],
  );

  const setPinned = useCallback(
    async (id: string, pinned: boolean) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned, pinned_at: pinned ? new Date().toISOString() : null } : m)));
      const result = await setPinnedAction({ messageId: id, pinned });
      if (!result.ok) {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !pinned } : m)));
        toast.error(result.error ?? "Hindi na-pin.");
        return false;
      }
      toast.success(pinned ? "Na-pin ang message 📌" : "Na-unpin ang message.");
      return true;
    },
    [],
  );

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
        toast.error(result.error ?? "Hindi na-react.");
      }
    },
    [reactions, me.id, channelId],
  );

  const pinned = useMemo(() => messages.filter((m) => m.pinned).sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "")), [messages]);

  return { messages, reactions, hasMore, loadingOlder, loadOlder, send, retry, discard, edit, remove, setPinned, toggleReaction, pinned };
}
