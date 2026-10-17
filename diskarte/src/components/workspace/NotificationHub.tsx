"use client";

import Link from "next/link";
import {
  AtSign,
  Bell,
  CheckCheck,
  Hash,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import {
  isUnread as isChannelUnread,
  useOptionalUnreads,
} from "@/components/providers/UnreadsProvider";
import { SavedMessages } from "./SavedMessages";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { Popover } from "@/components/ui/Popover";
import { Tooltip } from "@/components/ui/Tooltip";
import { EmptyState } from "@/components/ui/EmptyState";
import { conversationTitle, isUnread } from "@/lib/social";
import type { Server } from "@/lib/servers";
import { cn } from "@/lib/utils";

const TABS = ["inbox", "mentions", "saved"] as const;

export function NotificationHub({ servers = [] }: { servers?: Server[] }) {
  const social = useOptionalSocial();
  const requests = (social?.friends ?? []).filter(
    (friend) => friend.status === "incoming",
  );
  const unreadAll = (social?.conversations ?? []).filter(isUnread);
  const unreads = useOptionalUnreads();
  const channels = [...(unreads?.channels.entries() ?? [])].filter(
    ([, channel]) => isChannelUnread(channel) || channel.mentions > 0,
  );
  const attention = (social?.attention ?? 0) + channels.length;
  const [tab, setTab] = useState<(typeof TABS)[number]>("inbox");
  const id = useId();
  const visibleChannels = channels
    .filter(([, channel]) => tab !== "mentions" || channel.mentions > 0)
    .slice(0, 8);
  function markAllRead() {
    unreads?.markAllRead();
    for (const conversation of unreadAll) social?.markRead(conversation.id);
  }
  function move(event: KeyboardEvent) {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + delta + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }
  return (
    <Popover
      label="Notifications"
      side="right"
      align="end"
      testId="notification-hub"
      className="w-[23rem]"
      trigger={({ toggle, ref, open, ...aria }) => (
        <Tooltip label="Notifications" side="right">
          <button
            ref={ref}
            type="button"
            onClick={toggle}
            {...aria}
            aria-label={
              attention ? `Notifications (${attention} new)` : "Notifications"
            }
            className={cn(
              "relative flex size-11 items-center justify-center rounded-2xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white",
              open && "bg-white/10 text-white",
            )}
          >
            <Bell className="size-5" aria-hidden />
            {attention > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full border-2 border-abyss bg-red-600 px-1 text-[10px] font-bold text-white"
                aria-hidden
              >
                {attention > 99 ? "99+" : attention}
              </span>
            )}
          </button>
        </Tooltip>
      )}
    >
      {(close) => (
        <div className="activity-inbox">
          <div className="activity-heading">
            <div>
              <p className="section-kicker">YOUR COMMUNITY, CAUGHT UP</p>
              <h2>Activity inbox</h2>
            </div>
            <Bell className="size-5 text-sun" aria-hidden />
          </div>
          <div
            role="tablist"
            aria-label="Notifications"
            onKeyDown={move}
            className="activity-tabs"
          >
            {TABS.map((value) => (
              <button
                key={value}
                id={`${id}-${value}`}
                type="button"
                role="tab"
                aria-selected={tab === value}
                aria-controls={`${id}-panel`}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
              >
                {value === "inbox"
                  ? "Inbox"
                  : value === "mentions"
                    ? "Mentions"
                    : "Saved"}
              </button>
            ))}
          </div>
          {tab !== "saved" && (unreadAll.length > 0 || channels.length > 0) && (
            <button
              type="button"
              onClick={markAllRead}
              className="activity-read-all"
            >
              <CheckCheck className="size-4" aria-hidden /> Mark all as read
            </button>
          )}
          <div
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-${tab}`}
            className="activity-scroll scrollbar-thin"
          >
            {tab === "saved" ? (
              <SavedMessages onOpen={close} />
            ) : (
              <>
                {tab === "inbox" && requests.length > 0 && (
                  <>
                    <p className="activity-group-label">Friend requests</p>
                    <ul>
                      {requests.map((request) => {
                        const profile = social?.profiles.get(request.userId);
                        return (
                          <li key={request.userId}>
                            <Link
                              href="/tambayan/friends"
                              onClick={close}
                              className="activity-row"
                            >
                              {profile ? (
                                <UserAvatar profile={profile} size={32} />
                              ) : (
                                <UserPlus
                                  className="size-5 text-sun"
                                  aria-hidden
                                />
                              )}
                              <span>
                                <strong>
                                  {profile?.display_name ?? "Someone"}
                                </strong>
                                <small>sent you a friend request</small>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {tab === "inbox" && unreadAll.length > 0 && (
                  <>
                    <p className="activity-group-label">Conversations</p>
                    <ul>
                      {unreadAll.slice(0, 8).map((conversation) => (
                        <li key={conversation.id}>
                          <Link
                            href={`/tambayan/dm/${conversation.id}`}
                            onClick={close}
                            className="activity-row"
                          >
                            {conversation.others[0] ? (
                              <UserAvatar
                                profile={conversation.others[0]}
                                size={32}
                              />
                            ) : (
                              <MessageCircle
                                className="size-5 text-neon"
                                aria-hidden
                              />
                            )}
                            <span>
                              <strong>{conversationTitle(conversation)}</strong>
                              <small>New messages</small>
                            </span>
                            <span className="activity-unread-dot" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {visibleChannels.length > 0 && (
                  <>
                    <p className="activity-group-label">
                      {tab === "mentions"
                        ? "Mentions"
                        : "Around your tambayans"}
                    </p>
                    <ul>
                      {visibleChannels.map(([channelId, channel]) => (
                        <li key={channelId}>
                          <Link
                            href={`/tambayan/${channel.serverId}/${channelId}`}
                            onClick={close}
                            className="activity-row"
                          >
                            {channel.mentions ? (
                              <AtSign className="size-5 text-sun" aria-hidden />
                            ) : (
                              <Hash
                                className="size-5 text-slate-400"
                                aria-hidden
                              />
                            )}
                            <span>
                              <strong>
                                {servers.find(
                                  (server) => server.id === channel.serverId,
                                )?.name ?? "Channel activity"}
                              </strong>
                              <small>
                                {channel.mentions
                                  ? `${channel.mentions} unread mention${channel.mentions === 1 ? "" : "s"}`
                                  : "New channel messages"}
                              </small>
                            </span>
                            <span className="activity-unread-dot" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {visibleChannels.length === 0 &&
                  (tab === "mentions" ||
                    (!requests.length && !unreadAll.length)) && (
                    <EmptyState
                      title="You’re all caught up."
                      icon={<CheckCheck className="size-5" />}
                    >
                      A little room for your next conversation.
                    </EmptyState>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
