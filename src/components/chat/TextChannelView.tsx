"use client";

import { Hash, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { sendMessageAction } from "@/actions/messages";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { MemberList } from "@/components/server/MemberList";
import { Timestamp } from "./Timestamp";
import { useShellUI } from "@/components/shell/ShellUI";
import { isGroupedWithPrevious, sameDay } from "@/lib/chat-format";
import { MESSAGE_MAX, type MessageWithAuthor } from "@/lib/messages";
import type { Channel } from "@/lib/servers";

export function TextChannelView({ channel, initialMessages }: { channel: Channel; initialMessages: MessageWithAuthor[] }) {
  const { membersOpen } = useShellUI();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  const [seed, setSeed] = useState(initialMessages);
  if (seed !== initialMessages) {
    setSeed(initialMessages);
    setMessages(initialMessages);
  }
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView().
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send() {
    const content = draft.trim();
    if (!content || pending) return;
    startTransition(async () => {
      const result = await sendMessageAction({ channelId: channel.id, content });
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Hindi na-send.");
        return;
      }
      setDraft("");
      setMessages((prev) => [...prev, result.data!.message]);
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex min-w-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`#${channel.name}`}>
        <ChannelHeader channel={channel} />
        <div className="scrollbar-thin flex-1 overflow-y-auto" role="log" aria-live="polite" data-testid="message-list">
          <div className="px-4 pb-4 pt-10">
            <div className="mb-6">
              <span className="mb-3 flex size-16 items-center justify-center rounded-full bg-white/10">
                <Hash className="size-9 text-white" aria-hidden />
              </span>
              <h2 className="text-3xl font-extrabold text-white">Welcome sa #{channel.name}!</h2>
              <p className="text-slate-400">{channel.topic || "Ito ang simula ng channel na 'to."}</p>
            </div>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !sameDay(prev.created_at, m.created_at);
              const grouped = !newDay && isGroupedWithPrevious(prev, m);
              const name = m.author?.display_name ?? "Deleted user";
              return (
                <div key={m.id} data-testid="message">
                  {newDay && (
                    <div className="my-4 flex items-center gap-2" role="separator">
                      <span className="h-px flex-1 bg-white/10" />
                      <Timestamp iso={m.created_at} variant="day" className="font-silk text-[10px] uppercase tracking-wider text-slate-500" />
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                  )}
                  <article className={`group flex gap-3 rounded-md px-2 hover:bg-white/[0.03] ${grouped ? "py-0.5" : "mt-3 py-1"}`}>
                    <div className="w-10 shrink-0">
                      {grouped ? (
                        <Timestamp iso={m.created_at} variant="time" className="invisible block pt-1 text-right text-[10px] text-slate-500 group-hover:visible" />
                      ) : m.author ? (
                        <UserAvatar profile={m.author} size={40} />
                      ) : (
                        <span className="block size-10 rounded-full bg-white/10" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <p className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate font-semibold text-white">{name}</span>
                          <Timestamp iso={m.created_at} className="shrink-0 whitespace-nowrap text-xs text-slate-500" />
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-[15px] text-slate-200">{m.content}</p>
                    </div>
                  </article>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
        </div>
        <form
          className="px-4 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="glass flex items-end gap-2 rounded-xl px-3 py-2">
            <label htmlFor="composer" className="sr-only">
              Message #{channel.name}
            </label>
            <textarea
              id="composer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={MESSAGE_MAX}
              placeholder={`Message #${channel.name}`}
              className="max-h-48 min-h-6 flex-1 resize-none bg-transparent py-1 text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
              data-testid="composer"
            />
            <button type="submit" disabled={!draft.trim() || pending} aria-label="Send message" className="rounded-md p-1.5 text-sun transition-opacity disabled:opacity-30">
              <SendHorizontal className="size-5" aria-hidden />
            </button>
          </div>
        </form>
      </section>
      {membersOpen && (
        <div className="hidden lg:flex">
          <MemberList />
        </div>
      )}
    </div>
  );
}
