"use client";

import { Clock, CornerUpLeft, FileText, Loader2, Lock, Paperclip, SendHorizontal, ShieldAlert, Turtle, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import type { ChatMessage, SendResult } from "@/hooks/useChannelChat";
import { typingLabel } from "@/hooks/useTyping";
import { formatDuration } from "@/lib/community";
import { MAX_ATTACHMENTS, MESSAGE_MAX, type Attachment } from "@/lib/messages";
import { ATTACHMENT_ACCEPT, uploadAttachment } from "@/lib/uploads";
import { ScheduleButton } from "./ScheduledMessages";
import { applySlashCommand, slashSuggestions } from "@/lib/slash-commands";
import { VoiceRecorder } from "./VoiceRecorder";
import { onMentionRequest } from "@/lib/mention";
import { cn, formatBytes } from "@/lib/utils";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";
import { StickerPicker } from "./StickerPicker";
import { useDraft } from "@/lib/drafts";
import { SyncNotice } from "@/components/profile/AccountPreferencesSync";
import { Button as PulseButton, IconButton } from "@/components/pulse/Button";
import { Kbd } from "@/components/pulse/Controls";
import { useShellKind } from "@/components/shell/ShellKind";
import { previewText } from "@/lib/messages";

const PULSE_TOOL = "inline-flex size-8 items-center justify-center rounded-pulse-control p-0 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text aria-expanded:bg-pulse-selected aria-expanded:text-pulse-text disabled:text-pulse-disabled disabled:opacity-100 pointer-coarse:size-11 [&_svg]:size-4";

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
  voiceDuration?: number;
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
  extra,
  draftScope = "main",
  schedulable = false,
  uploads: allowUploads = true,
}: {
  /** false: no files or voice messages (temporary Hangouts, whose files would outlive them). */
  uploads?: boolean;
  /** Offer "Schedule message" (server text channels). */
  schedulable?: boolean;
  /** More toolbar buttons (the channel's "Create poll"). */
  extra?: ReactNode;
  draftScope?: string;
  channelName: string;
  /** Attachments upload under this server/channel; DMs use their private conversation folder. */
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
  lockKind?: "read-only" | "verification" | "timeout";
}) {
  const supabase = useSupabase();
  const { me } = useMe();
  const [draft, setDraft, draftSync] = useDraft(me.id, `${channelId}:${draftScope}`);
  const sending = useRef(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const liveUploads = useRef<PendingUpload[]>([]);
  const alive = useRef(true);
  const updateUploads = useCallback((change: (previous: PendingUpload[]) => PendingUpload[]) => {
    liveUploads.current = change(liveUploads.current);
    setUploads(liveUploads.current);
  }, []);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cooldown = useCountdown(cooldownUntil);
  const pulse = useShellKind() === "pulse";

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

  // "Mention" from someone's menu drops @them where you're typing.
  const mention = useEffectEvent((username: string) => insert(`@${username} `));
  useEffect(() => onMentionRequest((username) => mention(username)), []);

  // Release preview object URLs on unmount (removal/sending revoke their own).
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      liveUploads.current.forEach((u) => {
        if (u.preview) URL.revokeObjectURL(u.preview);
        if (u.attachment) void supabase.storage.from("attachments").remove([u.attachment.path]).catch(() => undefined);
      });
    };
  }, [supabase]);

  const upload = useCallback(async (item: PendingUpload) => {
    updateUploads((prev) => prev.map((u) => u.key === item.key ? { ...u, status: "uploading" } : u));
    try {
      const attachment = await uploadAttachment(supabase, { serverId, channelId, userId: me.id, file: item.file });
      if (!alive.current || !liveUploads.current.some((u) => u.key === item.key)) {
        await supabase.storage.from("attachments").remove([attachment.path]); return;
      }
      updateUploads((prev) => prev.map((u) => u.key === item.key ? { ...u, status: "done", attachment: item.voiceDuration === undefined ? attachment : { ...attachment, voice: true, duration: item.voiceDuration } } : u));
    } catch (error) {
      if (!alive.current || !liveUploads.current.some((u) => u.key === item.key)) return;
      toast.error(error instanceof Error ? error.message : "Upload failed. Try again.");
      updateUploads((prev) => prev.map((u) => u.key === item.key ? { ...u, status: "error" } : u));
    }
  }, [serverId, channelId, me.id, supabase, updateUploads]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!allowUploads) return void (files.length && toast.error("Files can't be shared in a temporary hangout. Keep it to share files."));
      const room = MAX_ATTACHMENTS - liveUploads.current.length;
      if (files.length > room) toast.error(`Up to ${MAX_ATTACHMENTS} files per message.`);
      for (const file of files.slice(0, Math.max(0, room))) {
        const key = crypto.randomUUID();
        const preview = file.type.startsWith("image/") && file.type !== "image/svg+xml" ? URL.createObjectURL(file) : null;
        const item: PendingUpload = { key, file, preview, status: "uploading" };
        updateUploads((prev) => [...prev, item]);
        void upload(item);
      }
    },
    [upload, updateUploads, allowUploads],
  );

  async function removeUpload(key: string) {
    const target = uploads.find((u) => u.key === key);
    updateUploads((prev) => prev.filter((u) => u.key !== key));
    if (target?.preview) URL.revokeObjectURL(target.preview);
    if (target?.attachment) await supabase.storage.from("attachments").remove([target.attachment.path]).catch(() => undefined);
  }

  const commands = slashSuggestions(draft);
  const busy = uploads.some((u) => u.status === "uploading");
  const failedUpload = uploads.some((u) => u.status === "error");
  const ready = uploads.filter((u) => u.status === "done" && u.attachment).map((u) => u.attachment!);

  async function submit() {
    const content = applySlashCommand(draft.trim());
    if ((!content && ready.length === 0) || busy || failedUpload || cooldown > 0 || sending.current) return;
    if (content.length > MESSAGE_MAX) {
      toast.error(`${MESSAGE_MAX} characters max.`);
      return;
    }
    const previous = { draft, uploads, replyTo };
    sending.current = true;
    setDraft("");
    updateUploads(() => []);
    onCancelReply();
    onStopTyping();
    let result: SendResult;
    try { result = await onSend(content, ready, previous.replyTo?.id ?? null); }
    catch { result = "rejected"; toast.error("Message couldn’t send. Your draft has been restored."); }
    finally { sending.current = false; }
    if (result === "rejected") {
      // Slow mode / auto-mod / verification: nothing was posted, so hand the draft back.
      setDraft((d) => d || previous.draft);
      updateUploads((current) => [...previous.uploads, ...current]);
      return;
    }
    // A failed text message stays in the list with Retry; a failed files-only send restores the tray.
    if (result === "failed" && !content) updateUploads((current) => [...previous.uploads, ...current]);
    else previous.uploads.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
  }

  // A voice message goes out on its own, straight away (like Discord), replying if a reply is open.
  async function sendVoice(file: File, seconds: number) {
    const item: PendingUpload = { key: crypto.randomUUID(), file, preview: null, status: "error", voiceDuration: seconds };
    let voice: Attachment | undefined;
    try {
      const attachment = await uploadAttachment(supabase, { serverId, channelId, userId: me.id, file });
      if (!alive.current) { await supabase.storage.from("attachments").remove([attachment.path]); return; }
      const replyId = replyTo?.id ?? null;
      onCancelReply();
      voice = { ...attachment, voice: true, duration: seconds };
      const result = await onSend("", [voice], replyId);
      if (result === "rejected") updateUploads((items) => [...items, { ...item, status: "done", attachment: voice }]);
    } catch (err) {
      if (alive.current) updateUploads((items) => [...items, { ...item, ...(voice ? { status: "done", attachment: voice } : {}) }]);
      toast.error((err as Error).message);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey && commands.length) {
      e.preventDefault();
      setDraft(`/${commands[0].name} `);
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
  const lockIcon = lockKind === "timeout" ? Clock : lockKind === "read-only" ? Lock : ShieldAlert;
  const fileInputEl = allowUploads && (
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
  );
  const voiceEl = allowUploads && <VoiceRecorder disabled={cooldown > 0} onRecorded={(file, seconds) => void sendVoice(file, seconds)} />;
  // Pulse: the pickers' triggers match the dock's IconButtons (32 px, 44 px on touch).
  const tool = pulse ? PULSE_TOOL : undefined;
  const emojiEl = <EmojiPicker onPick={(value) => insert(value.startsWith(":") ? `${value} ` : value)} label="Insert icon" triggerClassName={tool ?? "pointer-coarse:p-3.5"} />;
  const gifEl = (
    <GifPicker
      triggerClassName={tool}
      disabled={cooldown > 0}
      onPick={(url) => {
        const replyId = replyTo?.id ?? null;
        onCancelReply();
        void onSend(url, [], replyId);
      }}
    />
  );
  const stickerEl = onSticker && <StickerPicker onPick={onSticker} disabled={cooldown > 0} triggerClassName={tool} />;
  const scheduleEl = schedulable && (
    <ScheduleButton
      channelId={channelId}
      content={applySlashCommand(draft.trim())}
      disabled={!draft.trim() || draft.trim().length > MESSAGE_MAX || uploads.length > 0}
      onScheduled={() => setDraft("")}
    />
  );
  const sendDisabled = (!draft.trim() && ready.length === 0) || busy || failedUpload || cooldown > 0;
  const textareaProps = {
    id: `composer-${channelId}`,
    ref: textarea,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      if (e.target.value) onTyping();
      else onStopTyping();
    },
    onKeyDown,
    onPaste,
    rows: 1,
    enterKeyHint: "send" as const,
    maxLength: MESSAGE_MAX + 100,
    placeholder: placeholder ?? `Message #${channelName}`,
    "data-testid": "composer",
  };
  const dragProps = {
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  if (locked && pulse) {
    const Icon = lockIcon;
    return (
      <div className="px-3 pb-safe font-pulse-text md:px-5">
        <p className="mb-3 flex items-center gap-3 rounded-pulse-card border border-pulse-line bg-pulse-raised px-4 py-3 text-pulse-body text-pulse-muted" role="status" data-testid="composer-locked" data-lock={lockKind}>
          <Icon className="size-5 shrink-0 text-pulse-accent-ink" aria-hidden />
          {locked}
        </p>
      </div>
    );
  }

  if (pulse) {
    // Compose dock: a raised card a little above the bottom edge. The field on top, tools and the Send pill under it.
    return (
      <div className="relative px-3 pb-safe font-pulse-text md:px-5" {...dragProps}>
        <SyncNotice sync={draftSync} />
        {dragging && (
          <div className="pointer-events-none absolute inset-x-3 -top-24 bottom-3 z-20 flex items-center justify-center rounded-pulse-card border-2 border-dashed border-pulse-accent-mark bg-pulse-surface text-pulse-label font-semibold text-pulse-text md:inset-x-5">
            Drop files to attach
          </div>
        )}
        {/* Typing: a quiet line above the dock, words first (the dots only move when motion is welcome). */}
        <p className="flex h-6 items-center gap-1.5 px-1 text-pulse-caption text-pulse-muted" aria-live="off" data-testid="typing-line">
          {typing && (
            <>
              <span className="inline-flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1 rounded-full bg-pulse-faint pulse-motion:animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              <span className="truncate">{typing}</span>
            </>
          )}
        </p>
        {replyTo && (
          // Ticket stub: what you're replying to, on a raised tab with a dashed (torn) top edge, attached to the dock.
          <div className="mx-3 flex items-center gap-2 rounded-t-pulse-item border-x border-t-2 border-pulse-line-strong bg-pulse-raised py-1 pl-3 pr-1 text-pulse-label text-pulse-muted [border-top-style:dashed]" data-reply-stub="">
            <CornerUpLeft className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Replying to <strong className="font-semibold text-pulse-text">{replyTo.author?.display_name ?? "Deleted user"}</strong>
              {previewText(replyTo.content) && <span> · {previewText(replyTo.content, 80)}</span>}
            </span>
            <IconButton label="Cancel reply" icon={<X />} size="sm" onClick={onCancelReply} />
          </div>
        )}
        <div className="@container mb-3 overflow-hidden rounded-pulse-card border border-pulse-line bg-pulse-surface shadow-pulse-2 transition-[border-color,box-shadow] has-[textarea:focus-visible]:border-pulse-focus has-[textarea:focus-visible]:shadow-[0_0_0_1px_var(--pulse-focus-ring)]">
          {commands.length > 0 && (
            <ul className="border-b border-pulse-line p-1" aria-label="Commands" data-testid="slash-commands">
              {commands.map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(`/${c.name} `);
                      textarea.current?.focus();
                    }}
                    className="flex min-h-9 w-full items-baseline gap-2 rounded-pulse-control px-2 py-1.5 text-left text-pulse-body hover:bg-pulse-hover pointer-coarse:min-h-11"
                  >
                    <span className="font-semibold text-pulse-text">/{c.name}</span>
                    <span className="truncate text-pulse-label text-pulse-muted">{c.hint}</span>
                  </button>
                </li>
              ))}
              <li className="px-2 pt-0.5 text-pulse-caption text-pulse-muted">
                <Kbd>Tab</Kbd> to complete
              </li>
            </ul>
          )}
          {uploads.length > 0 && (
            <ul className="flex gap-2 overflow-x-auto border-b border-pulse-line p-2" aria-label="Attachments to send">
              {uploads.map((u) => (
                <li key={u.key} className="relative w-28 shrink-0 rounded-pulse-item border border-pulse-line bg-pulse-raised p-1.5">
                  {u.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.preview} alt="" className="h-20 w-full rounded-pulse-control object-cover" />
                  ) : (
                    <span className="flex h-20 items-center justify-center">
                      <FileText className="size-8 text-pulse-muted" aria-hidden />
                    </span>
                  )}
                  <p className="mt-1 truncate text-pulse-caption text-pulse-text" title={u.file.name}>
                    {u.file.name}
                  </p>
                  <p className={cn("text-pulse-caption", u.status === "error" ? "font-semibold text-pulse-alert" : "text-pulse-muted")}>{u.status === "error" ? "Failed" : formatBytes(u.file.size)}</p>
                  {u.status === "error" && (
                    <button type="button" aria-label={`Retry ${u.file.name}`} onClick={() => void upload(u)} className="mt-1 min-h-11 w-full rounded-pulse-control border border-pulse-input text-pulse-label font-semibold text-pulse-text">
                      Retry upload
                    </button>
                  )}
                  {u.status === "uploading" && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-pulse-item bg-pulse-scrim">
                      <Loader2 className="size-5 animate-spin text-pulse-text" aria-label="Uploading" />
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${u.file.name}`}
                    onClick={() => void removeUpload(u.key)}
                    className="absolute right-0 top-0 flex size-8 items-center justify-center rounded-full bg-pulse-alert text-pulse-on-alert shadow-pulse-1 pointer-coarse:size-11"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {fileInputEl}
            <label htmlFor={`composer-${channelId}`} className="sr-only">
              Message #{channelName}
            </label>
            {/* 16 px on phones so iOS doesn't zoom into the field. */}
            <textarea {...textareaProps} className="max-h-60 min-h-11 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-base text-pulse-text outline-none placeholder:text-pulse-muted md:text-pulse-body" />
            <div className="flex flex-wrap items-center gap-0.5 px-2 pb-2" data-testid="composer-tools" data-dock-tools="">
              {allowUploads && <IconButton tooltip label="Attach files" icon={<Paperclip />} size="sm" onClick={() => fileInput.current?.click()} />}
              {voiceEl}
              {gifEl}
              {emojiEl}
              {stickerEl}
              {extra}
              {scheduleEl}
              <span data-compose-feedback="" className="flex min-w-2 flex-1 items-center justify-end gap-2 pr-1 text-pulse-caption">
                {slowmodeSeconds > 0 && (
                  <span className={cn("inline-flex items-center gap-1", cooldown > 0 ? "font-semibold text-pulse-text" : "text-pulse-muted")} data-testid="slowmode-indicator">
                    <Turtle className="size-3.5" aria-hidden />
                    {cooldown > 0 ? `Slow mode: ${cooldown}s` : `Slow mode ${formatDuration(slowmodeSeconds)}`}
                  </span>
                )}
                {draft.length > MESSAGE_MAX - 200 && <span className={cn("tabular-nums", draft.length > MESSAGE_MAX ? "font-semibold text-pulse-alert" : "text-pulse-muted")}>{MESSAGE_MAX - draft.length}</span>}
              </span>
              <PulseButton type="submit" variant="primary" size="sm" disabled={sendDisabled} aria-label="Send message" className="gap-2">
                Send
                <Kbd label="Enter" className="border-current/30 bg-transparent text-current max-md:hidden">
                  ↵
                </Kbd>
              </PulseButton>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="px-4 pb-safe">
        <p className="glass mb-6 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-300" role="status" data-testid="composer-locked" data-lock={lockKind}>
          {lockKind === "timeout" ? <Clock className="size-5 shrink-0 text-sun" aria-hidden /> : lockKind === "read-only" ? <Lock className="size-5 shrink-0 text-sun" aria-hidden /> : <ShieldAlert className="size-5 shrink-0 text-sun" aria-hidden />}
          {locked}
        </p>
      </div>
    );
  }

  return (
    <div className="message-composer relative px-4 pb-safe" {...dragProps}>
      <SyncNotice sync={draftSync} />
      {dragging && (
        <div className="pointer-events-none absolute inset-x-4 -top-24 bottom-6 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-sun bg-abyss/80 font-pixel text-[10px] text-sun">
          DROP FILES HERE
        </div>
      )}
      <div className="composer-surface glass @container overflow-hidden rounded-xl transition-shadow focus-within:border-sun/50 focus-within:ring-2 focus-within:ring-sun/25">
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
        {commands.length > 0 && (
          <ul className="border-b border-white/5 p-1" aria-label="Commands" data-testid="slash-commands">
            {commands.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(`/${c.name} `);
                    textarea.current?.focus();
                  }}
                  className="flex min-h-9 w-full items-baseline gap-2 rounded-md px-2 text-left text-sm hover:bg-white/10 pointer-coarse:min-h-11"
                >
                  <span className="font-semibold text-white">/{c.name}</span>
                  <span className="truncate text-xs text-slate-400">{c.hint}</span>
                </button>
              </li>
            ))}
            <li className="px-2 pt-0.5 text-[11px] text-slate-500">Tab to complete</li>
          </ul>
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
                {u.status === "error" && <button type="button" aria-label={`Retry ${u.file.name}`} onClick={() => void upload(u)} className="mt-1 min-h-11 w-full rounded bg-white/10 text-xs text-sun">Retry upload</button>}
                {u.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                    <Loader2 className="size-5 animate-spin text-sun" aria-label="Uploading" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${u.file.name}`}
                  onClick={() => void removeUpload(u.key)}
                  className="absolute right-0 top-0 flex size-8 items-center justify-center rounded-full bg-red-500 text-white shadow pointer-coarse:size-11"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          // Narrow composers (phones, slim panels) give the textarea its own row above the buttons.
          className="flex flex-wrap items-end gap-1 px-2 py-1.5 @xl:flex-nowrap"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {allowUploads && (
            <>
              {fileInputEl}
              <button type="button" aria-label="Attach files" onClick={() => fileInput.current?.click()} className="touch-target relative rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:p-3">
                <Paperclip className="size-5" aria-hidden />
              </button>
              {voiceEl}
            </>
          )}
          <span aria-hidden className="flex-1 @xl:hidden" />
          <label htmlFor={`composer-${channelId}`} className="sr-only">
            Message #{channelName}
          </label>
          <textarea
            {...textareaProps}
            className="order-first max-h-60 min-h-6 min-w-0 basis-full resize-none bg-transparent @xl:order-none @xl:flex-1 @xl:basis-auto px-1 py-1.5 text-[15px] text-slate-100 outline-none placeholder:text-slate-500"
          />
          {emojiEl}
          {gifEl}
          {stickerEl}
          {extra}
          {scheduleEl}
          <button
            type="submit"
            disabled={sendDisabled}
            aria-label="Send message"
            className="composer-send touch-target relative rounded-md p-1.5 text-sun transition-opacity hover:bg-white/10 disabled:opacity-30 pointer-coarse:p-3"
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
