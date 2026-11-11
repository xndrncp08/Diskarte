"use client";

import { CheckCircle2, ChevronUp, Loader2, MessagesSquare, Pin, Plus, Search, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { setForumPostAction, setForumSettingsAction, toggleForumVoteAction } from "@/actions/messages";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { Modal } from "@/components/ui/Modal";
import { FORUM_STATUS_LABEL, NO_STATE, SUGGESTION_STATUSES, sortPosts, type ForumMode, type PostState } from "@/lib/forum";
import type { ForumStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { useShellKind } from "@/components/shell/ShellKind";
import { Button } from "@/components/ui/Button";
import { useChannelChat, type ChatMessage } from "@/hooks/useChannelChat";
import { useTimedOut } from "@/hooks/useTimedOut";
import { READ_ONLY_NOTICE, VERIFY_NOTICE, previewText, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { hasRole, type Channel } from "@/lib/servers";
import { ThreadPanel } from "./ThreadPanel";
import { Timestamp } from "./Timestamp";

const CLASSIC_FIELD = "w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-sun/70";
// Pulse: input edges at 3:1, 16 px text on phones (no iOS zoom), the global Pulse focus outline.
const PULSE_FIELD = "w-full rounded-pulse-control border border-pulse-input bg-pulse-surface px-3 font-pulse-text text-base text-pulse-text placeholder:text-pulse-muted md:text-pulse-body";
const useField = () => (useShellKind() === "pulse" ? PULSE_FIELD : CLASSIC_FIELD);
const activity = (m: ChatMessage) => Date.parse(m.thread_last_reply_at ?? m.created_at);

/**
 * Discord's forum channel: titled posts, newest activity first, each opening its own thread.
 * Posts are the channel's top-level messages, so slow mode, AutoMod, timeouts and unreads all apply.
 */
export function ForumView({ channel: initialChannel, initial }: { channel: Channel; initial: { messages: MessageWithAuthor[]; reactions: Reaction[]; hasMore: boolean } }) {
  const { me, verified } = useMe();
  const { myRole, members, channels } = useServer();
  const channel = channels.find((c) => c.id === initialChannel.id) ?? initialChannel;
  const canModerate = hasRole(myRole, "moderator");
  const chat = useChannelChat(channel.id, initial, { slowmodeSeconds: channel.slowmode_seconds, slowmodeExempt: canModerate });
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<ForumStatus | "open" | null>(null);
  const [top, setTop] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mode: ForumMode = channel.forum_mode ?? "discussion";
  const tags = channel.forum_tags ?? [];
  const { states, reload } = usePostStates(channel.id, chat.messages.length);
  const state = (id: string) => states.get(id) ?? NO_STATE;

  const markRead = useOptionalUnreads()?.markRead;
  const newest = chat.messages.at(-1)?.id;
  useEffect(() => {
    if (document.visibilityState === "visible") markRead?.(channel.id);
  }, [markRead, channel.id, newest]);

  const timedOut = useTimedOut(members.find((m) => m.user_id === me.id)?.timeout_until);
  const readOnly = channel.read_only && myRole !== "admin";
  const locked = timedOut ? "You're timed out, so you can read posts but not write." : readOnly ? READ_ONLY_NOTICE : channel.requires_verification && !verified && !canModerate ? VERIFY_NOTICE : null;

  const q = query.trim().toLowerCase();
  const posts = sortPosts(
    chat.messages.filter((m) => {
      const s = state(m.id);
      return (!q || (m.title ?? "").toLowerCase().includes(q) || m.content.toLowerCase().includes(q))
        && (!tag || s.tags.includes(tag))
        && (!status || (status === "open" ? !s.status || s.status === "under_consideration" : s.status === status));
    }),
    activity,
    state,
    top && mode === "suggestions",
  );
  const filtered = !!(q || tag || status);
  const open = openId ? chat.messages.find((m) => m.id === openId) : undefined;
  const pulse = useShellKind() === "pulse";
  const field = useField();

  return (
    <div className="flex h-full w-full min-w-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`Forum ${channel.name}`}>
        <ChannelHeader channel={channel} />
        <div className={cn("flex items-center gap-2 border-b py-3", pulse ? "border-pulse-line px-3 md:px-5" : "border-white/5 px-4")}>
          <label className="relative flex-1">
            <span className="sr-only">Search posts</span>
            <Search className={cn("pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2", pulse ? "text-pulse-muted" : "text-slate-500")} aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts" className={cn(field, "h-9 pl-8", pulse && "h-10 pointer-coarse:h-11")} />
          </label>
          {!locked && (
            <Button size="sm" onClick={() => setComposing((c) => !c)} aria-expanded={composing}>
              <Plus className="size-4" aria-hidden /> {mode === "suggestions" ? "Suggest" : "New Post"}
            </Button>
          )}
          {canModerate && (
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Forum settings" className="flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white pointer-coarse:size-11">
              <Settings2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {(tags.length > 0 || mode === "suggestions") && (
          <div className="scrollbar-thin flex items-center gap-1.5 overflow-x-auto border-b border-white/5 px-4 py-2" role="toolbar" aria-label="Filter posts">
            {mode === "suggestions" && (
              <>
                <Chip active={top} onClick={() => setTop((t) => !t)}>Top</Chip>
                <select value={status ?? ""} onChange={(e) => setStatus((e.target.value || null) as ForumStatus | "open" | null)} aria-label="Filter by status" className="h-8 rounded-full border border-white/10 bg-abyss px-2 text-xs text-slate-200">
                  <option value="">Any status</option>
                  <option value="open">Open</option>
                  {SUGGESTION_STATUSES.map((s) => <option key={s} value={s}>{FORUM_STATUS_LABEL[s]}</option>)}
                </select>
              </>
            )}
            {tags.map((t) => (
              <Chip key={t} active={tag === t} onClick={() => setTag((cur) => (cur === t ? null : t))}>{t}</Chip>
            ))}
          </div>
        )}
        {locked && <p className={pulse ? "mx-3 mt-3 rounded-pulse-item border border-pulse-line bg-pulse-raised px-3 py-2 text-pulse-label text-pulse-muted md:mx-5" : "mx-4 mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300"} role="status">{locked}</p>}
        {composing && !locked && (
          <NewPost
            tags={tags}
            suggestion={mode === "suggestions"}
            onCancel={() => setComposing(false)}
            onPost={async (title, content, picked) => {
              const id = crypto.randomUUID();
              const result = await chat.send(content, [], null, { title, id });
              if (result === "rejected") return false;
              setComposing(false);
              // Tags go on once the post exists (a queued offline post keeps none; it can be tagged later).
              if (result === "sent" && picked.length) void setForumPostAction({ messageId: id, tags: picked }).then(() => reload());
              return true;
            }}
          />
        )}
        <ul className={cn("scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto", pulse ? "px-3 py-4 font-pulse-text md:px-5" : "p-4")} data-testid="forum-posts">
          {posts.length === 0 && <li className={pulse ? "py-12 text-center text-pulse-body text-pulse-muted" : "py-12 text-center text-sm text-slate-400"}>{filtered ? "No posts match." : mode === "suggestions" ? "No suggestions yet. Share the first idea!" : "No posts yet. Start the first one!"}</li>}
          {posts.map((post) => {
            const author = post.author ?? members.find((m) => m.user_id === post.author_id)?.profile;
            const s = state(post.id);
            return (
              <li key={post.id} className="flex gap-2">
                {mode === "suggestions" && <VoteButton messageId={post.id} state={s} disabled={!!locked || !!post.pending} onDone={reload} />}
                <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setOpenId(post.id)}
                  aria-current={openId === post.id ? "true" : undefined}
                  className={
                    pulse
                      ? "block w-full rounded-pulse-card border border-pulse-line bg-pulse-surface p-4 text-left shadow-pulse-1 transition-colors hover:bg-pulse-hover aria-[current=true]:border-pulse-accent-mark aria-[current=true]:bg-pulse-selected"
                      : "block w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] aria-[current=true]:border-sun/50"
                  }
                >
                  <span className="flex items-center gap-1.5">
                    {post.pinned && <Pin className={cn("size-3.5 shrink-0", pulse ? "text-pulse-accent-ink" : "text-sun")} aria-label="Pinned" />}
                    {s.status === "solved" && <CheckCircle2 className={cn("size-4 shrink-0", pulse ? "text-pulse-live" : "text-signal-green")} aria-hidden />}
                    <span className={pulse ? "truncate font-pulse-display text-pulse-lead font-semibold text-pulse-text" : "truncate text-base font-bold text-white"}>{post.title ?? previewText(post.content, 80)}</span>
                  </span>
                  {(s.tags.length > 0 || s.status) && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {s.status &&
                        (pulse ? (
                          // Pulse: the status in words on a tinted chip with a coloured mark (never colour alone).
                          <span className="inline-flex items-center gap-1 rounded-pulse-control border border-pulse-line px-1.5 py-0.5 text-pulse-caption font-semibold text-pulse-text">
                            <span className={cn("size-1.5 rounded-full", s.status === "solved" || s.status === "completed" ? "bg-pulse-live" : s.status === "declined" ? "bg-pulse-alert" : "bg-pulse-accent-mark")} aria-hidden />
                            {FORUM_STATUS_LABEL[s.status]}
                          </span>
                        ) : (
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.status === "solved" || s.status === "completed" ? "bg-signal-green/15 text-signal-green" : s.status === "declined" ? "bg-red-500/15 text-red-300" : "bg-sun/15 text-sun")}>{FORUM_STATUS_LABEL[s.status]}</span>
                        ))}
                      {s.tags.map((t) => <span key={t} className={pulse ? "rounded-pulse-control bg-pulse-raised px-1.5 py-0.5 text-pulse-caption text-pulse-muted" : "rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300"}>{t}</span>)}
                    </span>
                  )}
                  <span className={pulse ? "mt-1 line-clamp-2 block text-pulse-body text-pulse-muted" : "mt-1 line-clamp-2 block text-sm text-slate-300"}>{previewText(post.content, 200)}</span>
                  <span className={pulse ? "mt-2 flex items-center gap-2 text-pulse-caption text-pulse-muted" : "mt-2 flex items-center gap-2 text-xs text-slate-400"}>
                    {author && <UserAvatar profile={author} size={18} />}
                    <span className="truncate">{members.find((m) => m.user_id === post.author_id)?.nickname ?? author?.display_name ?? "Someone"}</span>
                    <span aria-hidden>·</span>
                    <MessagesSquare className="size-3.5" aria-hidden />
                    <span>{post.thread_reply_count}</span>
                    <span aria-hidden>·</span>
                    <Timestamp iso={post.thread_last_reply_at ?? post.created_at} />
                    {(post.pending || post.queued) && <Loader2 className="size-3 animate-spin" aria-label="Posting" />}
                  </span>
                </button>
                {openId === post.id && !post.pending && (canModerate || post.author_id === me.id) && (
                  <PostControls messageId={post.id} mode={mode} tags={tags} state={s} canModerate={canModerate} onDone={reload} />
                )}
                </div>
              </li>
            );
          })}
          {chat.hasMore && !q && (
            <li>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => void chat.loadOlder()} loading={chat.loadingOlder}>
                Load older posts
              </Button>
            </li>
          )}
        </ul>
      </section>
      {open && <ThreadPanel key={open.id} channel={channel} root={open} onClose={() => setOpenId(null)} locked={locked} />}
      {canModerate && (
        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Forum settings">
          {settingsOpen && <ForumSettings channelId={channel.id} mode={mode} tags={tags} onDone={() => setSettingsOpen(false)} />}
        </Modal>
      )}
    </div>
  );
}

/** Tags, status and votes for the channel's posts; refetched when posts come or go and after changes. */
function usePostStates(channelId: string, postCount: number) {
  const supabase = useSupabase();
  const [states, setStates] = useState<Map<string, PostState>>(new Map());
  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc("forum_overview", { p_channel: channelId });
    if (!error) setStates(new Map((data ?? []).map((row) => [row.message_id, { tags: row.tags, status: row.status, votes: row.votes, voted: row.voted }])));
  }, [supabase, channelId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on load and as posts arrive
    void reload();
  }, [reload, postCount]);
  return { states, reload };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  const pulse = useShellKind() === "pulse";
  const look = pulse
    ? cn("h-8 shrink-0 rounded-pulse-control border px-3 font-pulse-text text-pulse-label transition-colors pointer-coarse:h-11", active ? "border-pulse-accent-mark bg-pulse-selected font-semibold text-pulse-text" : "border-pulse-line text-pulse-muted hover:bg-pulse-hover hover:text-pulse-text")
    : cn("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors pointer-coarse:h-11", active ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 text-slate-300 hover:bg-white/5");
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={look}>
      {children}
    </button>
  );
}

function VoteButton({ messageId, state, disabled, onDone }: { messageId: string; state: PostState; disabled: boolean; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const pulse = useShellKind() === "pulse";
  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={`${state.voted ? "Remove your vote" : "Upvote"} (${state.votes})`}
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleForumVoteAction({ messageId });
          if (!result.ok) toast.error(result.error ?? "Couldn't vote.");
          await onDone();
        })
      }
      className={
        pulse
          ? cn("flex w-12 shrink-0 flex-col items-center justify-center rounded-pulse-item border font-pulse-text text-pulse-label font-bold tabular-nums transition-colors disabled:opacity-50", state.voted ? "border-pulse-accent-mark bg-pulse-selected text-pulse-text" : "border-pulse-line text-pulse-muted hover:bg-pulse-hover")
          : cn("flex w-12 shrink-0 flex-col items-center justify-center rounded-xl border text-sm font-bold tabular-nums transition-colors disabled:opacity-50", state.voted ? "border-sun/60 bg-sun/15 text-sun" : "border-white/10 text-slate-300 hover:bg-white/5")
      }
    >
      <ChevronUp className="size-5" aria-hidden />
      {state.votes}
    </button>
  );
}

/** Under the open post: its tags (author or moderator) and status (Solved, or the board statuses for moderators). */
function PostControls({ messageId, mode, tags, state, canModerate, onDone }: { messageId: string; mode: ForumMode; tags: string[]; state: PostState; canModerate: boolean; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const run = (input: Parameters<typeof setForumPostAction>[0]) =>
    startTransition(async () => {
      const result = await setForumPostAction(input);
      if (!result.ok) toast.error(result.error ?? "Couldn't update the post.");
      await onDone();
    });
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2" aria-label="Post settings" role="group">
      {mode === "discussion" ? (
        <Chip active={state.status === "solved"} onClick={() => !pending && run({ messageId, status: state.status === "solved" ? null : "solved" })}>
          {state.status === "solved" ? "Solved ✓" : "Mark solved"}
        </Chip>
      ) : (
        canModerate && (
          <select value={state.status ?? ""} disabled={pending} onChange={(e) => run({ messageId, status: (e.target.value || null) as ForumStatus | null })} aria-label="Suggestion status" className="h-8 rounded-full border border-white/10 bg-abyss px-2 text-xs text-slate-200 pointer-coarse:h-11">
            <option value="">No status</option>
            {SUGGESTION_STATUSES.map((s) => <option key={s} value={s}>{FORUM_STATUS_LABEL[s]}</option>)}
          </select>
        )
      )}
      {tags.map((t) => {
        const on = state.tags.includes(t);
        return (
          <Chip key={t} active={on} onClick={() => !pending && (on || state.tags.length < 5) && run({ messageId, tags: on ? state.tags.filter((x) => x !== t) : [...state.tags, t] })}>
            {t}
          </Chip>
        );
      })}
    </div>
  );
}

function ForumSettings({ channelId, mode: initialMode, tags: initialTags, onDone }: { channelId: string; mode: ForumMode; tags: string[]; onDone: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [pending, startTransition] = useTransition();
  const field = useField();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setForumSettingsAction({ channelId, mode, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
          if (!result.ok) return void toast.error(result.error ?? "Couldn't save.");
          toast.success("Forum updated.");
          onDone();
        });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-white">Kind of forum</legend>
        {(
          [
            ["discussion", "Discussion", "Questions and long-lived threads. Posts can be marked Solved."],
            ["suggestions", "Suggestion board", "Members upvote ideas; moderators set Planned, In progress, Completed or Declined."],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className={cn("block cursor-pointer rounded-lg border px-3 py-2", mode === value ? "border-sun/70 bg-sun/10" : "border-white/10 hover:border-white/25")}>
            <input type="radio" name="forum-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
            <span className="block text-sm font-semibold text-white">{label}</span>
            <span className="block text-xs text-slate-400">{hint}</span>
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-white">Tags</span>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Help, Events, Bug" className={`${field} h-11`} aria-describedby="forum-tags-hint" />
        <span id="forum-tags-hint" className="mt-1 block text-xs text-slate-400">Comma separated, up to 12. Removing a tag takes it off every post.</span>
      </label>
      <Button type="submit" loading={pending} className="w-full">
        Save
      </Button>
    </form>
  );
}

function NewPost({ onPost, onCancel, tags, suggestion }: { onPost: (title: string, content: string, tags: string[]) => Promise<boolean>; onCancel: () => void; tags: string[]; suggestion: boolean }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pulse = useShellKind() === "pulse";
  const field = useField();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    const ok = await onPost(title.trim(), content.trim(), picked);
    setBusy(false);
    if (ok) {
      setTitle("");
      setContent("");
    }
  }
  return (
    <form onSubmit={submit} className={pulse ? "mx-3 mt-3 space-y-2 rounded-pulse-card border border-pulse-line bg-pulse-surface p-3 shadow-pulse-2 md:mx-5" : "mx-4 mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3"} aria-label="New post">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder="Post title" aria-label="Post title" autoFocus className={`${field} h-10 font-semibold`} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} required rows={4} placeholder={suggestion ? "Describe your idea and why it helps" : "What's it about?"} aria-label="Post message" className={`${field} py-2`} />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
          {tags.map((t) => (
            <Chip key={t} active={picked.includes(t)} onClick={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length < 5 ? [...p, t] : p))}>
              {t}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={busy}>
          Post
        </Button>
      </div>
    </form>
  );
}
