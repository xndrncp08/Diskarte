"use client";

import { motion } from "framer-motion";
import { ArrowDown, Hash, Loader2, Pin } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { mentionsUser, useChannelChat, type ChatMessage } from "@/hooks/useChannelChat";
import { useTyping } from "@/hooks/useTyping";
import { isGroupedWithPrevious, sameDay } from "@/lib/chat-format";
import { READ_ONLY_NOTICE, VERIFY_NOTICE, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { hasRole, type Channel } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { Composer } from "./Composer";
import { VirtualMessageList, type VirtualMessageListHandle } from "./VirtualMessageList";
import { MessageItem, type MessageActions } from "./MessageItem";
import { OfflineBanner } from "./OfflineBanner";
import { PinsDrawer } from "./PinsDrawer";
import { ThreadPanel } from "./ThreadPanel";
import { Timestamp } from "./Timestamp";

const NO_REACTIONS: Reaction[] = [];


export function ChatView({ channel: initialChannel, initial }: { channel: Channel; initial: { messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean } }) {
  const { me, verified } = useMe();
  const { server, myRole, members, channels } = useServer();
  // Slow mode / verification settings change live (ServerProvider keeps channels current).
  const channel = channels.find((c) => c.id === initialChannel.id) ?? initialChannel;
  const canModerate = hasRole(myRole, "moderator");
  const chat = useChannelChat(channel.id, initial, { slowmodeSeconds: channel.slowmode_seconds, slowmodeExempt: canModerate });
  const { typingNames, notifyTyping, stopTyping } = useTyping(channel.id);
  // Read-only channels (Diskarte HQ's #announcements) take posts from admins only — the database enforces
  // it too; verification-gated channels need a confirmed account.
  const readOnly = channel.read_only && myRole !== "admin";
  const locked = readOnly ? READ_ONLY_NOTICE : channel.requires_verification && !verified && !canModerate ? VERIFY_NOTICE : null;
  const [threadRootId, setThreadRootId] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const listRef = useRef<VirtualMessageListHandle>(null);
  const prevHeight = useRef(0);
  const prevFirstId = useRef<string | undefined>(chat.messages[0]?.id);
  const prevCount = useRef(chat.messages.length);

  const messageKeys = useMemo(() => chat.messages.map((m) => m.id), [chat.messages]);
  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);
  const liveIds = useMemo(() => new Set(chat.messages.map((m) => m.id)), [chat.messages]);
  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.nickname ?? m.profile.display_name])), [members]);
  const threadRoot = threadRootId ? (byId.get(threadRootId) ?? null) : null;

  // Keep the viewport anchored: stick to bottom for new messages, preserve position when older ones prepend.
  useLayoutEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const firstId = chat.messages[0]?.id;
    const grewAtTop = firstId !== prevFirstId.current && prevCount.current > 0 && chat.messages.length > prevCount.current;
    if (grewAtTop) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
    } else if (chat.messages.length > prevCount.current) {
      const last = chat.messages[chat.messages.length - 1];
      if (atBottom || last?.author_id === me.id) listRef.current?.scrollToBottom();
      else setUnseen((n) => n + (chat.messages.length - prevCount.current));
    } else if (prevCount.current === 0 || atBottom) {
      listRef.current?.scrollToBottom();
    }
    prevFirstId.current = firstId;
    prevCount.current = chat.messages.length;
    prevHeight.current = el.scrollHeight;
  }, [chat.messages, atBottom, me.id]);

  function onScroll() {
    const el = listRef.current?.element;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && unseen) setUnseen(0);
    prevHeight.current = el.scrollHeight;
    if (el.scrollTop < 240 && chat.hasMore && !chat.loadingOlder) void chat.loadOlder();
  }

  function scrollToBottom() {
    listRef.current?.scrollToBottom("smooth");
    setUnseen(0);
  }

  const jumpTo = useCallback((id: string) => {
    // The target may be outside the rendered window: scroll the virtualizer there, then flash it.
    if (!listRef.current?.scrollToKey(id)) {
      toast("That message is further back — scroll up to load it.");
      return;
    }
    setPinsOpen(false);
    let tries = 0;
    const flash = () => {
      const el = document.getElementById(`message-${id}`);
      if (!el) {
        if (tries++ < 10) requestAnimationFrame(flash);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("ring-2", "ring-sun/60");
      setTimeout(() => el.classList.remove("ring-2", "ring-sun/60"), 1600);
    };
    requestAnimationFrame(flash);
  }, []);

  const actions = useMemo<MessageActions>(
    () => ({
      onReply: (m) => setReplyTo(m),
      onEdit: (id, content) => chat.edit(id, content),
      onDelete: (m, skipConfirm) => (skipConfirm ? void chat.remove(m.id) : setConfirmDelete(m)),
      onPin: (id, pinned) => void chat.setPinned(id, pinned),
      onReact: (id, emoji) => void chat.toggleReaction(id, emoji),
      onOpenThread: (m) => setThreadRootId(m.id),
      onRetry: (m) => void chat.retry(m),
      onDiscard: (id) => chat.discard(id),
      onJump: jumpTo,
      nameOf: (userId) => names.get(userId) ?? "Someone",
    }),
    [chat, jumpTo, names],
  );

  function editLast() {
    const last = [...chat.messages].reverse().find((m) => m.author_id === me.id && !m.pending && !m.failed);
    if (last) setEditingId(last.id);
  }

  return (
    <div className="flex min-w-0 flex-1">
      <motion.section
        className="relative flex min-w-0 flex-1 flex-col md:overflow-hidden"
        aria-label={`#${channel.name}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      >
        <ChannelHeader
          channel={channel}
          actions={
            <Tooltip label="Pinned messages" side="bottom">
              <button
                type="button"
                aria-label="Pinned messages"
                aria-expanded={pinsOpen}
                onClick={() => setPinsOpen((o) => !o)}
                className={cn("touch-target relative rounded-md p-1.5 transition-colors hover:bg-white/10", pinsOpen ? "text-white" : "text-slate-400")}
              >
                <Pin className="size-5" aria-hidden />
              </button>
            </Tooltip>
          }
        />
        <PinsDrawer
          open={pinsOpen}
          onClose={() => setPinsOpen(false)}
          channelId={channel.id}
          livePinned={chat.pinned}
          liveIds={liveIds}
          canModerate={canModerate}
          onUnpin={(id) => void chat.setPinned(id, false)}
          onJump={jumpTo}
        />

        <VirtualMessageList
          ref={listRef}
          onScroll={onScroll}
          keys={messageKeys}
          header={
            chat.hasMore ? (
              <div className="flex justify-center py-4 text-slate-500">
                {chat.loadingOlder ? (
                  <Loader2 className="size-5 animate-spin" aria-label="Loading older messages" />
                ) : (
                  <span className="text-xs">Scroll up for more</span>
                )}
              </div>
            ) : (
              <div className="px-4 pb-2 pt-10">
                <span className="mb-3 flex size-16 items-center justify-center rounded-full bg-white/10">
                  <Hash className="size-9 text-white" aria-hidden />
                </span>
                <h2 className="text-3xl font-extrabold text-white">Welcome to #{channel.name}!</h2>
                <p className="text-slate-400">{channel.topic || "This is the start of the channel."}</p>
              </div>
            )
          }
          renderItem={(i) => {
            const m = chat.messages[i];
            const prev = chat.messages[i - 1];
            const newDay = !prev || !sameDay(prev.created_at, m.created_at);
            return (
              <>
                {newDay && (
                  <div className="mx-4 my-4 flex items-center gap-2" role="separator">
                    <span className="h-px flex-1 bg-white/10" />
                    <Timestamp iso={m.created_at} variant="day" className="font-silk text-[10px] uppercase tracking-wider text-slate-500" />
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                )}
                <MessageItem
                  message={m}
                  grouped={!newDay && isGroupedWithPrevious(prev, m)}
                  replyTo={m.reply_to_id ? (byId.get(m.reply_to_id) ?? null) : undefined}
                  reactions={chat.reactions.get(m.id) ?? NO_REACTIONS}
                  meId={me.id}
                  canModerate={canModerate}
                  mentioned={m.author_id !== me.id && mentionsUser(m.content, me.username)}
                  editing={editingId === m.id}
                  setEditing={setEditingId}
                  active={activeId === m.id}
                  onActivate={setActiveId}
                  actions={actions}
                />
              </>
            );
          }}
        />

        {!atBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-sun px-3 py-1.5 text-xs font-bold text-abyss shadow-lg"
          >
            <ArrowDown className="size-3.5" aria-hidden />
            {unseen > 0 ? `${unseen} new message${unseen === 1 ? "" : "s"}` : "Jump to present"}
          </button>
        )}

        <OfflineBanner queued={chat.queuedCount} />
        <Composer
          channelName={channel.name}
          serverId={server.id}
          channelId={channel.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={chat.send}
          onSticker={(sticker) => {
            void chat.send("", [], replyTo?.id ?? null, { sticker });
            setReplyTo(null);
          }}
          onEditLast={editLast}
          typingNames={typingNames}
          onTyping={notifyTyping}
          onStopTyping={stopTyping}
          cooldownUntil={chat.cooldownUntil}
          slowmodeSeconds={canModerate ? 0 : channel.slowmode_seconds}
          locked={locked}
          lockKind={readOnly ? "read-only" : "verification"}
        />
      </motion.section>

      {threadRoot && <ThreadPanel key={threadRoot.id} channel={channel} root={threadRoot} onClose={() => setThreadRootId(null)} locked={locked} />}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void chat.remove(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title="Delete message?"
        confirmLabel="Delete"
      >
        <span className="line-clamp-3 block rounded-lg bg-black/40 p-2 text-slate-300">{confirmDelete?.content || (confirmDelete?.sticker ? "(sticker)" : "(attachment)")}</span>
        <span className="mt-2 block text-xs">Tip: Shift + click delete to skip this confirmation.</span>
      </ConfirmDialog>
    </div>
  );
}
