"use client";

import { Inbox as InboxIcon, MessageCircle } from "lucide-react";
import Link from "next/link";
import { RelativeTime } from "../RelativeTime";
import { ConversationAvatar } from "@/components/social/HomeSidebar";
import { useNow } from "@/components/social/Hangouts";
import { hangoutTimeLeft, topicLabel } from "@/lib/hangouts";
import { conversationTitle, isUnread, type ConversationSummary } from "@/lib/social";
import { SegmentedControl } from "../Controls";
import { Input } from "../Field";
import { NavItem } from "../Nav";
import { EmptyState, Skeleton } from "../States";
import { Masthead } from "../shell/Masthead";

/**
 * Messages in Pulse is a focused inbox, not a second copy of the navigator's People list: search, All / Unread, and
 * roomier rows with when each conversation last moved. Friends and new group DMs stay in the navigator. Data is
 * useSocial()'s conversations, filtered by MessagesView (the same list Classic shows).
 */
export function PulseInbox({ conversations, list, query, onQuery, unreadOnly, onUnreadOnly }: { conversations: ConversationSummary[] | null; list: ConversationSummary[]; query: string; onQuery: (value: string) => void; unreadOnly: boolean; onUnreadOnly: (value: boolean) => void }) {
  const now = useNow();
  const unread = conversations?.filter(isUnread).length ?? 0;
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text">
      <Masthead eyebrow="People" title="Messages" icon={<MessageCircle />} description={unread ? `${unread} unread` : "You're all caught up"} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input label="Search conversations" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Name or group" wrapperClassName="sm:flex-1" />
            <SegmentedControl label="Show" options={[{ value: "all", label: "All" }, { value: "unread", label: unread ? `Unread (${unread})` : "Unread" }]} value={unreadOnly ? "unread" : "all"} onChange={(v) => onUnreadOnly(v === "unread")} className="self-start sm:self-auto" />
          </div>
          {conversations === null ? (
            <div role="status" aria-label="Loading conversations" className="mt-4 space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : list.length === 0 ? (
            <EmptyState title={query || unreadOnly ? "No conversations match" : "No messages yet"} icon={<InboxIcon />} headingLevel={2} className="mt-4"
              action={query || unreadOnly ? undefined : <Link href="/tambayan/friends" className="inline-flex min-h-11 items-center font-semibold text-pulse-accent-ink hover:underline">Find a friend</Link>}>
              {query || unreadOnly ? "Try another name, or show all." : "Add a friend to start one."}
            </EmptyState>
          ) : (
            <ul className="mt-4 space-y-0.5" data-testid="messages-list" aria-label={`${list.length} conversation${list.length === 1 ? "" : "s"}`}>
              {list.map((c) => (
                <li key={c.id}>
                  <NavItem
                    href={`/tambayan/dm/${c.id}`}
                    label={conversationTitle(c)}
                    leading={<ConversationAvatar conversation={c} size={40} />}
                    unread={isUnread(c)}
                    secondary={c.hangoutUntil ? `${topicLabel(c.hangoutTopic)} · ${hangoutTimeLeft(c.hangoutUntil, now)}` : <>{c.kind === "group" ? `${c.others.length + 1} members · ` : ""}<RelativeTime iso={c.lastMessageAt} /></>}
                    className="min-h-14"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
