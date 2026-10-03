"use client";

import { FileText, Loader2, Lock, Paperclip, SendHorizontal, ShieldAlert, Turtle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import type { ChatMessage, SendResult } from "@/hooks/useChannelChat";
import { typingLabel } from "@/hooks/useTyping";
import { formatDuration } from "@/lib/community";
import { MAX_ATTACHMENTS, MESSAGE_MAX, type Attachment } from "@/lib/messages";
import { ATTACHMENT_ACCEPT, uploadAttachment } from "@/lib/uploads";
import { cn, formatBytes } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";
import { StickerPicker } from "./StickerPicker";

/** Seconds left until `until` (a Date.now() timestamp), ticking while it's in the future. */
function useCountdown(until: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const active = until != null && until > now;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active, until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

interface PendingUpload {
  key: string;
  file: File;
  preview: string | null;
  status: "uploading" | "done" | "error";
  attachment?: Attachment;
}

export function Composer({
  channelName,
  serverId,
  channelId,
  replyTo,
  onCancelReply,
  onSend,
  onSticker,
  onEditLast,
  typingNames,
  onTyping,
  onStopTyping,
  placeholder,
  cooldownUntil,
  slowmodeSeconds = 0,
  locked,
  lockKind = "verification",
}: {
  channelName: string;
  /** Attachments upload under this server/channel; omit it (DMs) to hide the attach button. */
  serverId?: string;
  channelId: string;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (content: string, attachments: Attachment[], replyToId: string | null) => Promise<SendResult>;
  onSticker?: (id: string) => void;
  onEditLast: () => void;
  typingNames: string[];
  onTyping: () => void;
  onStopTyping: () => void;
  placeholder?: string;
  /** Slow mode: sending is paused until this Date.now() timestamp. */
  cooldownUntil?: number | null;
  slowmodeSeconds?: number;
  /** Replaces the input with a notice (e.g. verification required). */
  locked?: string | null;
  /** "read-only": a creators-only channel (lock icon); "verification": confirm your account first. */
  lockKind?: "read-only" | "verification";
}) {
  const supabase = useSupabase();
  const { me } = useMe();
  const [draft, setDraft] = useState("");
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cooldown = useCountdown(cooldownUntil);

  // Autosize the textarea up to ~10 lines.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft]);

  useEffect(() => {
    if (replyTo) textarea.current?.focus();
  }, [replyTo]);

  // Release preview object URLs on unmount (removal/sending revoke their own).
  const liveUploads = useRef<PendingUpload[]>([]);
  useEffect(() => {
    liveUploads.current = uploads;
  }, [uploads]);
  useEffect(() => () => liveUploads.current.forEach((u) => u.preview && URL.revokeObjectURL(u.preview)), []);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!serverId) return;
      const room = MAX_ATTACHMENTS - uploads.length;
      if (files.length > room) toast.error(`Up to ${MAX_ATTACHMENTS} files per message.`);
      for (const file of files.slice(0, Math.max(0, room))) {
        const key = crypto.randomUUID();
        const preview = file.type.startsWith("image/") && file.type !== "image/svg+xml" ? URL.createObjectURL(file) : null;
        setUploads((prev) => [...prev, { key, file, preview, status: "uploading" }]);
        uploadAttachment(supabase, { serverId, channelId, userId: me.id, file })
          .then((attachment) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "done", attachment } : u))))
          .catch((err: Error) => {
            toast.error(err.message);
            setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error" } : u)));
          });
      }
    },
    [supabase, serverId, channelId, me.id, uploads.length],
  );

  async function removeUpload(key: string) {
    const target = uploads.find((u) => u.key === key);
    setUploads((prev) => prev.filter((u) => u.key !== key));
    if (target?.preview) URL.revokeObjectURL(target.preview);
    if (target?.attachment) await supabase.storage.from("attachments").remove([target.attachment.path]);
  }

  const busy = uploads.some((u) => u.status === "uploading");
  const ready = uploads.filter((u) => u.status === "done" && u.attachment).map((u) => u.attachment!);

  async function submit() {
    const content = draft.trim();
    if ((!content && ready.length === 0) || busy || cooldown > 0) return;
    if (content.length > MESSAGE_MAX) {
      toast.error(`${MESSAGE_MAX} characters max.`);
      return;
    }
    const previous = { draft, uploads, replyTo };
    setDraft("");
    setUploads([]);
    onCancelReply();
    onStopTyping();
    const result = await onSend(content, ready, previous.replyTo?.id ?? null);
    if (result === "rejected") {
      // Slow mode / auto-mod / verification: nothing was posted, so hand the draft back.
      setDraft((d) => d || previous.draft);
      setUploads(previous.uploads);
      return;
    }
    // A failed text message stays in the list with Retry; a failed files-only send restores the tray.
    if (result === "failed" && !content) setUploads(previous.uploads);
    else previous.uploads.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape" && replyTo) {
      onCancelReply();
    } else if (e.key === "ArrowUp" && !draft) {
      e.preventDefault();
      onEditLast();
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  function insert(text: string) {
    const el = textarea.current;
    if (!el) return setDraft((d) => d + text);
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const typing = typingLabel(typingNames);

  if (locked) {
    return (
      <div className="px-4 pb-safe">
        <p className="glass mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-300" role="status" data-testid="composer-locked" data-lock={lockKind}>
          {lockKind === "read-only" ? <Lock className="size-5 shrink-0 text-sun" aria-hidden /> : <ShieldAlert className="size-5 shrink-0 text-sun" aria-hidden />}
          {locked}
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative px-4 pb-safe"
      onDragOver={(e) => {
        if (serverId && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-x-4 -top-24 bottom-6 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-sun bg-abyss/80 font-pixel text-[10px] text-sun">
          DROP FILES HERE
        </div>
      )}
      <div className="glass overflow-hidden rounded-xl transition-shadow focus-within:border-sun/50 focus-within:ring-2 focus-within:ring-sun/25">
        {replyTo && (
          <div className="flex items-center justify-between border-b border-white/5 bg-black/30 px-3 py-1.5 text-xs text-slate-400">
            <span className="truncate">
              Replying to <strong className="text-slate-200">{replyTo.author?.display_name ?? "Deleted user"}</strong>
            </span>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="rounded p-0.5 hover:bg-white/10 hover:text-white">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}
        {uploads.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto border-b border-white/5 p-2" aria-label="Attachments to send">
            {uploads.map((u) => (
              <li key={u.key} className="relative w-28 shrink-0 rounded-lg border border-white/10 bg-black/40 p-1.5">
                {u.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.preview} alt="" className="h-20 w-full rounded object-cover" />
                ) : (
                  <span className="flex h-20 items-center justify-center">
                    <FileText className="size-8 text-sky-300" aria-hidden />
                  </span>
                )}
                <p className="mt-1 truncate text-[11px] text-slate-300" title={u.file.name}>
                  {u.file.name}
                </p>
                <p className={cn("text-[10px]", u.status === "error" ? "text-red-300" : "text-slate-500")}>{u.status === "error" ? "Failed" : formatBytes(u.file.size)}</p>
                {u.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <Loader2 className="size-5 animate-spin text-sun" aria-label="Uploading" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${u.file.name}`}
                  onClick={() => void removeUpload(u.key)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 p-0.5 text-white shadow"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex items-end gap-1 px-2 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {serverId && (
            <>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                aria-label="Attach files"
                // Triggered by the visible button below; keep it out of the tab order / a11y tree.
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button type="button" aria-label="Attach files" onClick={() => fileInput.current?.click()} className="touch-target relative rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:p-3">
                <Paperclip className="size-5" aria-hidden />
              </button>
            </>
          )}
          <label htmlFor={`composer-${channelId}`} className="sr-only">
            Message #{channelName}
          </label>
          <textarea
            id={`composer-${channelId}`}
            ref={textarea}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value) onTyping();
              else onStopTyping();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            maxLength={MESSAGE_MAX + 100}
            placeholder={placeholder ?? `Message #${channelName}`}
            className="max-h-60 min-h-6 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
            data-testid="composer"
          />
          <EmojiPicker onPick={(value) => insert(value.startsWith(":") ? `${value} ` : value)} label="Insert emoji" triggerClassName="pointer-coarse:p-3.5" />
          {onSticker && <StickerPicker onPick={onSticker} disabled={cooldown > 0} />}
          <button
            type="submit"
            disabled={(!draft.trim() && ready.length === 0) || busy || cooldown > 0}
            aria-label="Send message"
            className="touch-target relative rounded-md p-1.5 text-sun transition-opacity hover:bg-white/10 disabled:opacity-30 pointer-coarse:p-3"
          >
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </form>
      </div>
      <div className="flex h-5 items-center justify-between px-1 text-[11px]" aria-live="polite">
        <span className="truncate text-slate-400">
          {typing && (
            <>
              <span className="mr-1 inline-flex gap-0.5 align-middle" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1 animate-bounce bg-slate-300" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              <strong className="text-slate-200">{typing}</strong>
            </>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {slowmodeSeconds > 0 && (
            <span className={cn("flex items-center gap-1 font-silk", cooldown > 0 ? "text-sun" : "text-slate-500")} data-testid="slowmode-indicator">
              <Turtle className="size-3.5" aria-hidden />
              {cooldown > 0 ? `Slow mode: ${cooldown}s` : `Slow mode ${formatDuration(slowmodeSeconds)}`}
            </span>
          )}
          {draft.length > MESSAGE_MAX - 200 && <span className={cn("font-silk tabular-nums", draft.length > MESSAGE_MAX ? "text-red-300" : "text-slate-500")}>{MESSAGE_MAX - draft.length}</span>}
        </span>
      </div>
    </div>
  );
}
