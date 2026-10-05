"use client";

import { AtSign, LogOut, Menu as MenuIcon, Phone, PhoneOff, Video } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { leaveDmAction, type DirectMessage } from "@/actions/social";
import { Composer } from "@/components/chat/Composer";
import { MessageItem, type MessageActions } from "@/components/chat/MessageItem";
import { OfflineBanner } from "@/components/chat/OfflineBanner";
import { Timestamp } from "@/components/chat/Timestamp";
import { useMe } from "@/components/providers/MeProvider";
import { useSocial } from "@/components/providers/SocialProvider";
import { useShellUI } from "@/components/shell/ShellUI";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCall, usePrewarm } from "@/components/voice/CallProvider";
import { useRinger } from "@/components/voice/IncomingCalls";
import { StageSkeleton } from "@/components/voice/StageSkeleton";
import { useDirectChat } from "@/hooks/useDirectChat";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { isGroupedWithPrevious, sameDay } from "@/lib/chat-format";
import type { Server } from "@/lib/servers";
import { conversationTitle, type SocialProfile } from "@/lib/social";
import type { Tables } from "@/lib/supabase/database.types";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ConversationAvatar, HomeSidebar } from "./HomeSidebar";

const VoiceStage = dynamic(() => import("@/components/voice/live/VoiceStage").then((m) => m.VoiceStage), { ssr: false, loading: () => <StageSkeleton /> });

const NO_REACTIONS: never[] = [];

export function DmView({
  servers,
  conversation,
  participants,
  initial,
  canSend,
}: {
  servers: Server[];
  conversation: Tables<"dm_conversations">;
  participants: SocialProfile[];
  initial: { messages: DirectMessage[]; hasMore: boolean };
  canSend: boolean;
}) {
  const { me } = useMe();
  const { markRead, reloadConversations } = useSocial();
  const { setNavOpen } = useShellUI();
  const call = useCall();
  const router = useRouter();
  const others = useMemo(() => participants.filter((p) => p.id !== me.id), [participants, me.id]);
  const title = conversationTitle({ kind: conversation.kind, name: conversation.name, others });
  const chat = useDirectChat(conversation.id, initial, participants, () => markRead(conversation.id));
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, startLeave] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const inCall = call.target?.kind === "dm" && call.target.channelId === conversation.id;

  useEffect(() => {
    markRead(conversation.id);
  }, [markRead, conversation.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [chat.messages.length]);

  const byId = new Map(chat.messages.map((m) => [m.id, m]));
  const names = new Map(participants.map((p) => [p.id, p.display_name]));
  const ringer = useRinger();
  const prewarm = usePrewarm();
  const callTarget = { kind: "dm" as const, serverId: "", serverName: "Direct Message", channelId: conversation.id, channelName: title };
  const actions: MessageActions = {
    onReply: setReplyTo,
    onEdit: (id, content) => chat.edit(id, content),
    onDelete: (m) => void chat.remove(m.id),
    onRetry: (m) => void chat.retry(m),
    onDiscard: chat.discard,
    onJump: (id) => document.getElementById(`message-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
    nameOf: (id) => names.get(id) ?? "Someone",
  };

  /** Join the DM's call room and ring everyone else in the conversation (their incoming-call pop-up). */
  async function startCall(video = false) {
    const joining = call.join(callTarget);
    void ringer?.ringDm(conversation.id, video);
    await joining;
    if (video) await call.toggleCamera();
  }

  function leave() {
    startLeave(async () => {
      const result = await leaveDmAction({ conversationId: conversation.id });
      if (!result.ok) return void toast.error(result.error ?? "Couldn't leave.");
      if (inCall) call.leave();
      await reloadConversations();
      router.replace("/tambayan");
    });
  }

  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title={title}>
        <section className="flex min-w-0 flex-1 flex-col md:overflow-hidden" aria-label={title}>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/5 bg-black/20 px-3 backdrop-blur-md">
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open navigation" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 md:hidden">
              <MenuIcon className="size-5" aria-hidden />
            </button>
            {conversation.kind === "direct" ? <AtSign className="size-5 shrink-0 text-slate-400" aria-hidden /> : null}
            <h1 className="truncate font-bold text-white" data-testid="dm-title">
              {title}
            </h1>
            {conversation.kind === "group" && <span className="hidden text-sm text-slate-400 sm:inline">· {participants.length} members</span>}
            <div className="ml-auto flex items-center gap-1">
              {inCall ? (
                <button type="button" onClick={call.leave} aria-label="End call" className="touch-target relative rounded-md p-1.5 text-red-300 hover:bg-red-500/15">
                  <PhoneOff className="size-5" aria-hidden />
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => void startCall()} {...prewarm(callTarget)} aria-label="Start voice call" disabled={!canSend} className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40">
                    <Phone className="size-5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => void startCall(true)} {...prewarm(callTarget)} aria-label="Start video call" disabled={!canSend} className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40">
                    <Video className="size-5" aria-hidden />
                  </button>
                </>
              )}
              {conversation.kind === "group" && (
                <button type="button" onClick={() => setConfirmLeave(true)} aria-label="Leave group" className="touch-target relative rounded-md p-1.5 text-slate-300 hover:bg-white/10">
                  <LogOut className="size-5" aria-hidden />
                </button>
              )}
            </div>
          </header>

          {inCall && call.status === "connected" && (
            <div className="flex max-h-[55%] min-h-64 shrink-0 flex-col border-b border-white/5" data-testid="dm-call">
              <VoiceStage />
            </div>
          )}

          <div className="scrollbar-thin flex-1 overflow-y-auto pb-2" aria-live="polite">
            {chat.hasMore ? (
              <div className="flex justify-center py-3">
                <Button variant="ghost" size="sm" onClick={() => void chat.loadOlder()}>
                  Load older messages
                </Button>
              </div>
            ) : (
              <div className="px-4 pb-2 pt-8">
                <ConversationAvatar conversation={{ id: conversation.id, kind: conversation.kind, name: conversation.name, ownerId: conversation.owner_id, lastMessageAt: "", lastReadAt: "", others }} size={72} />
                <h2 className="mt-3 text-2xl font-extrabold text-white">{title}</h2>
                <p className="text-slate-400">
                  {conversation.kind === "direct" ? `This is the start of your DMs with @${others[0]?.username ?? "?"}.` : `Welcome to the group DM! There are ${participants.length} of you here.`}
                </p>
              </div>
            )}
            {chat.messages.map((m, i) => {
              const prev = chat.messages[i - 1];
              const newDay = !prev || !sameDay(prev.created_at, m.created_at);
              return (
                <div key={m.id}>
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
                    reactions={NO_REACTIONS}
                    meId={me.id}
                    canModerate={false}
                    mentioned={false}
                    editing={editingId === m.id}
                    setEditing={setEditingId}
                    actions={actions}
                  />
                </div>
              );
            })}
            <div ref={bottom} />
          </div>

          <OfflineBanner queued={chat.queuedCount} />
          <Composer
            channelName={title}
            channelId={conversation.id}
            placeholder={conversation.kind === "direct" ? `Message @${others[0]?.username ?? ""}` : `Message ${title}`}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            onSend={chat.send}
            onSticker={(sticker) => {
              void chat.send("", [], replyTo?.id ?? null, { sticker });
              setReplyTo(null);
            }}
            onEditLast={() => {
              const last = [...chat.messages].reverse().find((m) => m.author_id === me.id && !m.pending && !m.sticker);
              if (last) setEditingId(last.id);
            }}
            typingNames={[]}
            onTyping={() => undefined}
            onStopTyping={() => undefined}
            locked={canSend ? null : "You're no longer friends (or someone blocked the other), so you can't message here anymore."}
          />
        </section>
      </WorkspacePanel>
      <ConfirmDialog open={confirmLeave} onClose={() => setConfirmLeave(false)} onConfirm={leave} pending={leaving} title={`Leave ${title}?`} confirmLabel="Leave">
        Hindi ka na makakatanggap ng messages mula sa group na &apos;to.
      </ConfirmDialog>
    </>
  );
}
