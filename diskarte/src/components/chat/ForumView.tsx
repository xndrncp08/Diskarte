"use client";

import { Loader2, MessagesSquare, Plus, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { useServer } from "@/components/providers/ServerProvider";
import { useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { ChannelHeader } from "@/components/server/ChannelHeader";
import { Button } from "@/components/ui/Button";
import { useChannelChat, type ChatMessage } from "@/hooks/useChannelChat";
import { useTimedOut } from "@/hooks/useTimedOut";
import { READ_ONLY_NOTICE, VERIFY_NOTICE, previewText, type MessageWithAuthor, type Reaction } from "@/lib/messages";
import { hasRole, type Channel } from "@/lib/servers";
import { ThreadPanel } from "./ThreadPanel";
import { Timestamp } from "./Timestamp";

const field = "w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-sun/70";
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

  const markRead = useOptionalUnreads()?.markRead;
  const newest = chat.messages.at(-1)?.id;
  useEffect(() => {
    if (document.visibilityState === "visible") markRead?.(channel.id);
  }, [markRead, channel.id, newest]);

  const timedOut = useTimedOut(members.find((m) => m.user_id === me.id)?.timeout_until);
  const readOnly = channel.read_only && myRole !== "admin";
  const locked = timedOut ? "You're timed out, so you can read posts but not write." : readOnly ? READ_ONLY_NOTICE : channel.requires_verification && !verified && !canModerate ? VERIFY_NOTICE : null;

  const q = query.trim().toLowerCase();
  const posts = chat.messages
    .filter((m) => !q || (m.title ?? "").toLowerCase().includes(q) || m.content.toLowerCase().includes(q))
    .sort((a, b) => activity(b) - activity(a));
  const open = openId ? chat.messages.find((m) => m.id === openId) : undefined;

  return (
    <div className="flex h-full min-w-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`Forum ${channel.name}`}>
        <ChannelHeader channel={channel} />
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <label className="relative flex-1">
            <span className="sr-only">Search posts</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts" className={`${field} h-9 pl-8`} />
          </label>
          {!locked && (
            <Button size="sm" onClick={() => setComposing((c) => !c)} aria-expanded={composing}>
              <Plus className="size-4" aria-hidden /> New Post
            </Button>
          )}
        </div>
        {locked && <p className="mx-4 mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-300" role="status">{locked}</p>}
        {composing && !locked && <NewPost onCancel={() => setComposing(false)} onPost={async (title, content) => (await chat.send(content, [], null, { title })) !== "rejected" && (setComposing(false), true)} />}
        <ul className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4" data-testid="forum-posts">
          {posts.length === 0 && <li className="py-12 text-center text-sm text-slate-400">{q ? "No posts match." : "No posts yet. Start the first one!"}</li>}
          {posts.map((post) => {
            const author = post.author ?? members.find((m) => m.user_id === post.author_id)?.profile;
            return (
              <li key={post.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(post.id)}
                  aria-current={openId === post.id ? "true" : undefined}
                  className="block w-full rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06] aria-[current=true]:border-sun/50"
                >
                  <span className="block truncate text-base font-bold text-white">{post.title ?? previewText(post.content, 80)}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-slate-300">{previewText(post.content, 200)}</span>
                  <span className="mt-2 flex items-center gap-2 text-xs text-slate-400">
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
    </div>
  );
}

function NewPost({ onPost, onCancel }: { onPost: (title: string, content: string) => Promise<boolean>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    const ok = await onPost(title.trim(), content.trim());
    setBusy(false);
    if (ok) {
      setTitle("");
      setContent("");
    }
  }
  return (
    <form onSubmit={submit} className="mx-4 mt-3 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3" aria-label="New post">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required placeholder="Post title" aria-label="Post title" autoFocus className={`${field} h-10 font-semibold`} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} required rows={4} placeholder="What's it about?" aria-label="Post message" className={`${field} py-2`} />
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
