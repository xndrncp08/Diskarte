"use client";

import { motion } from "framer-motion";
import { Loader2, MessagesSquare, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { useChannelChat, type ChatMessage } from "@/hooks/useChannelChat";
import { isGroupedWithPrevious } from "@/lib/chat-format";
import { MESSAGE_SELECT, previewText, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { hasRole, type Channel } from "@/lib/servers";
import { Composer } from "./Composer";
import { MessageItem, type MessageActions } from "./MessageItem";

const NO_REACTIONS: Reaction[] = [];
const THREAD_LIMIT = 200;

interface ThreadHistory {
  messages: MessageWithAuthor[];
  reactions: Reaction[];
  hasMore: boolean;
}

/** Side panel (full screen on phones) for one message's thread: root on top, replies, composer. */
export function ThreadPanel({ channel, root, onClose, locked }: { channel: Channel; root: ChatMessage; onClose: () => void; locked?: string | null }) {
  const supabase = useSupabase();
  const { me } = useMe();
  const [history, setHistory] = useState<ThreadHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("messages").select(MESSAGE_SELECT).eq("thread_id", root.id).order("created_at").limit(THREAD_LIMIT);
      const messages = (data ?? []) as unknown as MessageWithAuthor[];
      const { data: r } = messages.length
        ? await supabase
            .from("reactions")
            .select("*")
            .in(
              "message_id",
              messages.map((m) => m.id),
            )
        : { data: [] as Reaction[] };
      if (!cancelled) setHistory({ messages, reactions: r ?? [], hasMore: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, root.id]);

  return (
    <motion.aside
      aria-label="Thread"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="glass fixed inset-0 z-40 flex flex-col border-y-0 border-r-0 bg-abyss/95 md:static md:z-auto md:w-[26rem] md:shrink-0 md:overflow-hidden md:float-card"
      data-testid="thread-panel"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 px-3">
        <MessagesSquare className="size-5 text-sky-300" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate font-bold text-white">
          Thread <span className="font-normal text-slate-400">· {previewText(root.content, 40) || "Sticker"}</span>
        </h2>
        <button type="button" onClick={onClose} aria-label="Close thread" className="touch-target relative rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X className="size-5" aria-hidden />
        </button>
      </header>
      <div className="border-b border-white/5 py-3">
        <MessageItem
          message={root}
          grouped={false}
          replyTo={undefined}
          reactions={NO_REACTIONS}
          meId={me.id}
          canModerate={false}
          mentioned={false}
          editing={false}
          setEditing={() => undefined}
          actions={{ onReply: () => undefined, onEdit: async () => false, onDelete: () => undefined, onRetry: () => undefined, onDiscard: () => undefined, onJump: () => undefined, nameOf: () => "" }}
        />
      </div>
      {history ? (
        <ThreadBody channel={channel} root={root} initial={history} locked={locked} />
      ) : (
        <div className="flex flex-1 justify-center py-6 text-slate-500">
          <Loader2 className="size-5 animate-spin" aria-label="Loading replies" />
        </div>
      )}
    </motion.aside>
  );
}

/** Mounted once the thread history has loaded, so the live chat hook starts from it. */
function ThreadBody({ channel, root, initial, locked }: { channel: Channel; root: ChatMessage; initial: ThreadHistory; locked?: string | null }) {
  const { me } = useMe();
  const { server, myRole, members } = useServer();
  const canModerate = hasRole(myRole, "moderator");
  const chat = useChannelChat(channel.id, initial, { threadId: root.id, slowmodeSeconds: channel.slowmode_seconds, slowmodeExempt: canModerate });
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.nickname ?? m.profile.display_name])), [members]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [chat.messages.length]);

  const actions: MessageActions = {
    onReply: setReplyTo,
    onEdit: (id, content) => chat.edit(id, content),
    onDelete: (m) => void chat.remove(m.id),
    onReact: (id, emoji) => void chat.toggleReaction(id, emoji),
    onRetry: (m) => void chat.retry(m),
    onDiscard: (id) => chat.discard(id),
    onJump: (id) => document.getElementById(`thread-message-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    nameOf: (userId) => names.get(userId) ?? "Someone",
  };
  const byId = new Map(chat.messages.map((m) => [m.id, m]));

  return (
    <>
      <div className="scrollbar-thin flex-1 overflow-y-auto py-3" role="log" aria-label="Thread replies">
        <p className="px-4 pb-2 font-silk text-[11px] uppercase tracking-wider text-slate-500">
          {chat.messages.length} {chat.messages.length === 1 ? "reply" : "replies"}
        </p>
        {chat.messages.map((m, i) => (
          <div key={m.id} id={`thread-message-${m.id}`}>
            <MessageItem
              message={m}
              grouped={isGroupedWithPrevious(chat.messages[i - 1], m)}
              replyTo={m.reply_to_id ? (byId.get(m.reply_to_id) ?? null) : undefined}
              reactions={chat.reactions.get(m.id) ?? NO_REACTIONS}
              meId={me.id}
              canModerate={canModerate}
              mentioned={false}
              editing={editingId === m.id}
              setEditing={setEditingId}
              actions={actions}
            />
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <Composer
        channelName={channel.name}
        serverId={server.id}
        channelId={channel.id}
        placeholder="Reply in thread…"
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={chat.send}
        onSticker={(sticker) => void chat.send("", [], null, { sticker })}
        onEditLast={() => undefined}
        typingNames={[]}
        onTyping={() => undefined}
        onStopTyping={() => undefined}
        cooldownUntil={chat.cooldownUntil}
        slowmodeSeconds={canModerate ? 0 : channel.slowmode_seconds}
        locked={locked}
      />
    </>
  );
}
