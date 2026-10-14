"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowDown, Hash, Loader2, Pin } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { mentionsUser, useChannelChat, type ChatMessage } from "@/hooks/useChannelChat";
import { useConversationScroll } from "@/hooks/useConversationScroll";
import { useTimedOut } from "@/hooks/useTimedOut";
import { useTyping } from "@/hooks/useTyping";
import { isGroupedWithPrevious, sameDay } from "@/lib/chat-format";
import { READ_ONLY_NOTICE, VERIFY_NOTICE, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { hasRole, type Channel } from "@/lib/servers";
import { cn } from "@/lib/utils";
import { Composer } from "./Composer";
import { VirtualMessageList } from "./VirtualMessageList";
import { openMemberProfile } from "@/components/server/memberProfiles";
import { MessageItem, type MessageActions } from "./MessageItem";
import { OfflineBanner } from "./OfflineBanner";
import { PinsDrawer } from "./PinsDrawer";
import { CreatePollButton } from "./Poll";
import { ForwardDialog } from "./ForwardDialog";
import { ThreadPanel } from "./ThreadPanel";
import { Timestamp } from "./Timestamp";
const MessageContext = dynamic(() => import("./MessageContext").then((m) => m.MessageContext), { ssr: false });

const NO_REACTIONS: Reaction[] = [];


export function ChatView({ channel: initialChannel, initial }: { channel: Channel; initial: { messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean } }) {
  const messageTarget = useSearchParams().get("message");
  const { me, verified } = useMe();
  const { server, myRole, members, channels } = useServer();
  // Slow mode / verification settings change live (ServerProvider keeps channels current).
  const channel = channels.find((c) => c.id === initialChannel.id) ?? initialChannel;
  const canModerate = hasRole(myRole, "moderator");
  const chat = useChannelChat(channel.id, initial, { slowmodeSeconds: channel.slowmode_seconds, slowmodeExempt: canModerate });
  const { typingNames, notifyTyping, stopTyping } = useTyping(channel.id);

  // Reading it clears its unread pill and mentions: on open, as messages arrive while you're looking,
  // and when you come back to the tab.
  const markRead = useOptionalUnreads()?.markRead;
  const newest = chat.messages.at(-1)?.id;
  useEffect(() => {
    if (!markRead) return;
    const mark = () => document.visibilityState === "visible" && markRead(channel.id);
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [markRead, channel.id, newest]);
  // Read-only channels (Diskarte HQ's #announcements) take posts from admins only — the database enforces
  // it too; verification-gated channels need a confirmed account.
  const readOnly = channel.read_only && myRole !== "admin";
  const timeoutUntil = members.find((m) => m.user_id === me.id)?.timeout_until;
  const timedOut = useTimedOut(timeoutUntil);
  const locked = timedOut
    ? `You're timed out until ${new Date(timeoutUntil!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}. You can still read, but can't send messages or react.`
    : readOnly
      ? READ_ONLY_NOTICE
      : channel.requires_verification && !verified && !canModerate ? VERIFY_NOTICE : null;
  const [threadRootId, setThreadRootId] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChatMessage | null>(null);
  const { listRef, atBottom, unseen, onScroll, scrollToBottom } = useConversationScroll(`${me.id}:${channel.id}`, chat.messages, me.id, chat.loadOlder, chat.hasMore);

  const messageKeys = useMemo(() => chat.messages.map((m) => m.id), [chat.messages]);
  const byId = useMemo(() => new Map(chat.messages.map((m) => [m.id, m])), [chat.messages]);
  const liveIds = useMemo(() => new Set(chat.messages.map((m) => m.id)), [chat.messages]);
  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.nickname ?? m.profile.display_name])), [members]);
  const threadRoot = threadRootId ? (byId.get(threadRootId) ?? null) : null;

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
  }, [listRef]);

  // Saved messages (bookmarks) among what's loaded, Forward, and Mark Unread.
  const supabase = useSupabase();
  const unreads = useOptionalUnreads();
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const loadedIds = chat.messages
    .slice(-100)
    .filter((m) => !m.pending && !m.failed && !m.queued)
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (!loadedIds) return;
    let live = true;
    void supabase
      .from("saved_messages")
      .select("message_id")
      .in("message_id", loadedIds.split(","))
      .then(({ data }) => live && data && setSavedIds(new Set(data.map((r) => r.message_id))));
    return () => {
      live = false;
    };
  }, [supabase, loadedIds]);
  const save = useCallback(
    async (m: ChatMessage, on: boolean) => {
      const { error } = on ? await supabase.from("saved_messages").insert({ message_id: m.id }) : await supabase.from("saved_messages").delete().eq("message_id", m.id);
      if (error) return void toast.error("Couldn't update your saved messages.");
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(m.id);
        else next.delete(m.id);
        return next;
      });
      toast(on ? "Saved. Find it under Notifications → Saved." : "Removed from Saved.");
    },
    [supabase],
  );
  const markUnread = unreads?.markUnread;

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
      onOpenProfile: openMemberProfile,
      onForward: setForwarding,
      onSave: (m, on) => void save(m, on),
      savedIds,
      onMarkUnread: markUnread ? (m) => (markUnread(channel.id, m.created_at), toast("Marked unread from here.")) : undefined,
    }),
    [chat, jumpTo, names, save, savedIds, markUnread, channel.id],
  );

  function editLast() {
    const last = [...chat.messages].reverse().find((m) => m.author_id === me.id && !m.pending && !m.failed);
    if (last) setEditingId(last.id);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {messageTarget && <MessageContext channelId={channel.id} />}
      <motion.section
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
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
        <ForwardDialog
          message={forwarding}
          author={forwarding?.author_id ? (names.get(forwarding.author_id) ?? "Someone") : "Someone"}
          sourceChannel={channel.name}
          onClose={() => setForwarding(null)}
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
          extra={<CreatePollButton channelId={channel.id} />}
          typingNames={typingNames}
          onTyping={notifyTyping}
          onStopTyping={stopTyping}
          cooldownUntil={chat.cooldownUntil}
          slowmodeSeconds={canModerate ? 0 : channel.slowmode_seconds}
          locked={locked}
          lockKind={timedOut ? "timeout" : readOnly ? "read-only" : "verification"}
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
