"use client";

import { Clock, CornerUpLeft, MessagesSquare, Pencil, Pin, PinOff, RotateCw, Trash2, X } from "lucide-react";
import { memo, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { UserAvatar } from "@/components/profile/UserAvatar";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { parseAttachments, previewText, type Reaction } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { Attachments } from "./Attachments";
import { EmojiPicker } from "./EmojiPicker";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReactionBar } from "./ReactionBar";
import { Sticker } from "./Sticker";
import { Timestamp } from "./Timestamp";

export interface MessageActions {
  onReply: (m: ChatMessage) => void;
  onEdit: (id: string, content: string) => Promise<boolean>;
  onDelete: (m: ChatMessage, skipConfirm: boolean) => void;
  /** Omitted where pins / reactions / threads don't exist (DMs, inside a thread). */
  onPin?: (id: string, pinned: boolean) => void;
  onReact?: (id: string, emoji: string) => void;
  onOpenThread?: (m: ChatMessage) => void;
  onRetry: (m: ChatMessage) => void;
  onDiscard: (id: string) => void;
  onJump: (id: string) => void;
  nameOf: (userId: string) => string;
}

function ToolbarButton({ label, onClick, children, danger = false }: { label: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "touch-target relative rounded-md p-1.5 transition-colors hover:bg-white/10 pointer-coarse:p-2.5",
        danger ? "text-red-300 hover:text-red-200" : "text-slate-400 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSave(value);
    }
  }
  return (
    <div className="mt-1">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Edit message"
        rows={Math.min(8, value.split("\n").length + 1)}
        className="w-full resize-none rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[15px] text-slate-100 outline-none focus:border-sun/60"
      />
      <p className="text-xs text-slate-500">
        escape para <button type="button" className="text-sky-300 hover:underline" onClick={onCancel}>cancel</button> • enter para{" "}
        <button type="button" className="text-sky-300 hover:underline" onClick={() => onSave(value)}>
          save
        </button>
      </p>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  grouped,
  replyTo,
  reactions,
  meId,
  canModerate,
  mentioned,
  editing,
  active = false,
  onActivate,
  setEditing,
  actions,
}: {
  message: ChatMessage;
  grouped: boolean;
  replyTo: ChatMessage | null | undefined;
  reactions: Reaction[];
  meId: string;
  canModerate: boolean;
  mentioned: boolean;
  editing: boolean;
  setEditing: (id: string | null) => void;
  /** Touch: whether this message's action bar is pinned open, and a setter for the active message. */
  active?: boolean;
  onActivate?: (id: string | null) => void;
  actions: MessageActions;
}) {
  const mine = message.author_id === meId;
  const attachments = parseAttachments(message.attachments);
  const name = message.author?.display_name ?? "Deleted user";

  return (
    <article
      id={`message-${message.id}`}
      aria-label={`${name}: ${message.content.slice(0, 80)}`}
      data-testid="message"
      data-message-id={message.id}
      data-active={active || undefined}
      onClick={(e) => {
        // Touch screens have no hover: tapping a message (not one of its controls) toggles its actions.
        if (!onActivate || !window.matchMedia?.("(pointer: coarse)").matches) return;
        if ((e.target as Element).closest("button, a, textarea, input, [role=dialog]")) return;
        onActivate(active ? null : message.id);
      }}
      className={cn(
        "group relative flex gap-3 rounded-md px-3 transition-colors",
        grouped ? "py-0.5" : "mt-3 pb-0.5 pt-1",
        mentioned ? "border-l-2 border-sun bg-sun/[0.07] hover:bg-sun/10" : "hover:bg-white/[0.03]",
        (message.pending || message.queued) && "opacity-60",
      )}
    >
      <div className="w-10 shrink-0">
        {grouped ? (
          <Timestamp iso={message.created_at} variant="time" className="invisible block pt-1 text-right text-[10px] text-slate-500 group-hover:visible" />
        ) : message.author ? (
          <UserAvatar profile={message.author} size={40} />
        ) : (
          <span className="block size-10 rounded-full bg-white/10" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {replyTo !== undefined && message.reply_to_id && (
          <button
            type="button"
            onClick={() => replyTo && actions.onJump(replyTo.id)}
            className="mb-0.5 flex max-w-full items-center gap-1.5 text-left text-xs text-slate-400 hover:text-slate-200"
          >
            <CornerUpLeft className="size-3 shrink-0 -scale-x-100" aria-hidden />
            {replyTo ? (
              <>
                <span className="shrink-0 whitespace-nowrap font-semibold text-slate-300">@{replyTo.author?.display_name ?? "Deleted user"}</span>
                <span className="truncate">{previewText(replyTo.content) || (replyTo.sticker ? "Sticker" : "Attachment")}</span>
              </>
            ) : (
              <span className="italic">Hindi na makita ang original message</span>
            )}
          </button>
        )}
        {!grouped && (
          <p className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-semibold text-white">{name}</span>
            <Timestamp iso={message.created_at} className="shrink-0 whitespace-nowrap text-xs text-slate-500" />
            {message.pinned && <Pin className="size-3 shrink-0 text-sun" aria-label="Pinned" />}
          </p>
        )}

        {message.sticker && <Sticker id={message.sticker} size={144} className="mt-1" />}

        {editing ? (
          <EditBox
            initial={message.content}
            onCancel={() => setEditing(null)}
            onSave={async (value) => {
              if (value.trim() === message.content.trim()) return setEditing(null);
              if (!value.trim() && attachments.length === 0) {
                setEditing(null);
                return actions.onDelete(message, false);
              }
              if (await actions.onEdit(message.id, value)) setEditing(null);
            }}
          />
        ) : (
          message.content && (
            <div className="flex items-end gap-1.5">
              <MessageMarkdown content={message.content} />
              {message.edited_at && <span className="shrink-0 pb-0.5 text-[10px] text-slate-500">(edited)</span>}
            </div>
          )
        )}

        <Attachments attachments={attachments} />
        {actions.onReact && <ReactionBar reactions={reactions} meId={meId} onToggle={(emoji) => actions.onReact?.(message.id, emoji)} names={actions.nameOf} />}

        {actions.onOpenThread && message.thread_reply_count > 0 && (
          <button
            type="button"
            onClick={() => actions.onOpenThread?.(message)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold text-sky-300 transition-colors hover:border-sky-300/40 hover:bg-sky-400/10 pointer-coarse:py-2"
            data-testid="thread-chip"
          >
            <MessagesSquare className="size-3.5" aria-hidden />
            {message.thread_reply_count} {message.thread_reply_count === 1 ? "reply" : "replies"}
            {message.thread_last_reply_at && (
              <span className="font-normal text-slate-500">
                · <Timestamp iso={message.thread_last_reply_at} variant="time" />
              </span>
            )}
          </button>
        )}

        {message.queued && (
          <p className="mt-1 flex items-center gap-1.5 font-silk text-[11px] text-sun" role="status">
            <Clock className="size-3" aria-hidden /> Naka-queue — ise-send pagbalik ng signal
            <button type="button" onClick={() => actions.onDiscard(message.id)} className="ml-1 text-slate-400 underline-offset-2 hover:text-white hover:underline">
              Cancel
            </button>
          </p>
        )}

        {message.failed && (
          <p className="mt-1 flex items-center gap-2 text-xs text-red-300" role="alert">
            Hindi na-send.
            <button type="button" onClick={() => actions.onRetry(message)} className="inline-flex items-center gap-1 font-semibold hover:underline">
              <RotateCw className="size-3" aria-hidden /> Retry
            </button>
            <button type="button" onClick={() => actions.onDiscard(message.id)} className="inline-flex items-center gap-1 hover:underline">
              <X className="size-3" aria-hidden /> Discard
            </button>
          </p>
        )}
      </div>

      {!message.pending && !message.failed && !message.queued && !editing && (
        <div
          role="toolbar"
          aria-label="Message actions"
          className={cn(
            "glass-strong absolute -top-4 right-3 z-10 flex items-center rounded-lg p-0.5 shadow-lg",
            // Slides in on hover (mouse), focus (keyboard) or tap (touch: no hover on phones).
            "pointer-events-none translate-y-1 scale-95 opacity-0 transition-[opacity,transform] duration-150 ease-out",
            "group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100",
            "group-data-[active=true]:pointer-events-auto group-data-[active=true]:translate-y-0 group-data-[active=true]:scale-100 group-data-[active=true]:opacity-100",
            "motion-reduce:transition-none",
          )}
        >
          {actions.onReact && <EmojiPicker onPick={(emoji) => actions.onReact?.(message.id, emoji)} placement="bottom" />}
          <ToolbarButton label="Reply" onClick={() => actions.onReply(message)}>
            <CornerUpLeft className="size-4" aria-hidden />
          </ToolbarButton>
          {actions.onOpenThread && !message.thread_id && (
            <ToolbarButton label={message.thread_reply_count > 0 ? "Open thread" : "Start thread"} onClick={() => actions.onOpenThread?.(message)}>
              <MessagesSquare className="size-4" aria-hidden />
            </ToolbarButton>
          )}
          {mine && !message.sticker && (
            <ToolbarButton label="Edit" onClick={() => setEditing(message.id)}>
              <Pencil className="size-4" aria-hidden />
            </ToolbarButton>
          )}
          {canModerate && actions.onPin && (
            <ToolbarButton label={message.pinned ? "Unpin" : "Pin"} onClick={() => actions.onPin?.(message.id, !message.pinned)}>
              {message.pinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
            </ToolbarButton>
          )}
          {(mine || canModerate) && (
            <ToolbarButton label="Delete" danger onClick={(e) => actions.onDelete(message, e.shiftKey)}>
              <Trash2 className="size-4" aria-hidden />
            </ToolbarButton>
          )}
        </div>
      )}
    </article>
  );
});
