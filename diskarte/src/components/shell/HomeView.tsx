"use client";

import { MomentsStrip } from "@/components/social/Moments";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Compass,
  Headphones,
  LayoutGrid,
  MessageSquare,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { DmRow, HomeSidebar } from "@/components/social/HomeSidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tooltip } from "@/components/ui/Tooltip";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import { eventStatus, type ServerEvent } from "@/lib/events";
import { isUnread } from "@/lib/social";
import type { Server } from "@/lib/servers";
import { Timestamp } from "@/components/chat/Timestamp";
import { AddServerDialog } from "./AddServerDialog";
import { ServerIcon } from "./ServerIcon";
import "./home.css";

type HomeEvent = Pick<
  ServerEvent,
  "id" | "server_id" | "name" | "starts_at" | "ends_at"
>;

export function HomeView({
  servers,
  events = [],
  eventsUnavailable = false,
}: {
  servers: Server[];
  events?: HomeEvent[];
  eventsUnavailable?: boolean;
}) {
  const { me } = useMe();
  const social = useOptionalSocial();
  const unreads = useOptionalUnreads();
  const call = useCall();
  const router = useRouter();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  const conversations = social?.conversations;
  const unread = conversations?.filter(isUnread).length ?? 0;
  const friends = (social?.friends ?? []).filter(
    (friend) => friend.status === "accepted",
  );
  const mentions = [...(unreads?.channels.entries() ?? [])].filter(
    ([, channel]) => channel.mentions > 0,
  );
  const incoming =
    social?.friends?.filter((friend) => friend.status === "incoming").length ??
    0;
  return (
    <>
      <HomeSidebar servers={servers} />
      <WorkspacePanel id="main" title="Home">
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          data-testid="smart-tambay"
        >
          <PageHeader
            title="Home"
            description="Your people, conversations and shared spaces."
            icon={<LayoutGrid className="size-4" />}
            actions={
              <Tooltip label="Refresh home">
                <button
                  type="button"
                  aria-label="Refresh home"
                  onClick={() => router.refresh()}
                  className="flex size-11 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10"
                >
                  <RefreshCw className="size-4" aria-hidden />
                </button>
              </Tooltip>
            }
          />
          <div className="home-scroll scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <div className="home-dashboard">
              <header className="home-welcome">
                <div>
                  <p className="section-kicker">
                    SMART TAMBAY / YOUR DAILY SPACE
                  </p>
                  <h2>Welcome back, {me.display_name}!</h2>
                  <p>Your people. Your plans. Pick up where you left off.</p>
                </div>
                <DiskarteLogo size={80} variant="mascot" />
              </header>
              <MomentsStrip />
              <div className="home-signals">
                <Link href="/tambayan/messages">
                  <MessageSquare className="size-4" aria-hidden />
                  <strong>{unread}</strong>
                  <span>unread conversations</span>
                </Link>
                <Link href="/tambayan/friends">
                  <Users className="size-4" aria-hidden />
                  <strong>{friends.length}</strong>
                  <span>
                    {incoming
                      ? `${incoming} pending request${incoming === 1 ? "" : "s"}`
                      : "friends in your circle"}
                  </span>
                </Link>
                <a href="#your-tambayans">
                  <LayoutGrid className="size-4" aria-hidden />
                  <strong>{servers.length}</strong>
                  <span>your tambayans</span>
                </a>
              </div>
              {call.target && call.status !== "idle" && (
                <Link
                  href={callHref(call.target)}
                  className="home-current-call"
                >
                  <Headphones className="size-5" aria-hidden />
                  <span>
                    <strong>{call.target.channelName}</strong>
                    <small>
                      {call.status === "connected"
                        ? "You’re in this call. Jump back in."
                        : `${call.status}…`}
                    </small>
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
              <div className="home-grid">
                <section className="surface-card home-conversations">
                  <div className="home-section-title">
                    <h2>Pick up the conversation</h2>
                    <Link href="/tambayan/messages">
                      All messages <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                  {conversations == null ? (
                    <div role="status" className="space-y-2 p-4">
                      <span className="sr-only">Loading conversations</span>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-12 animate-pulse rounded-xl bg-white/5"
                        />
                      ))}
                    </div>
                  ) : conversations.length ? (
                    <ul className="home-dm-list">
                      {conversations.slice(0, 5).map((conversation) => (
                        <DmRow
                          key={conversation.id}
                          conversation={conversation}
                          active={false}
                        />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Your next kwento starts here"
                      icon={<MessageSquare className="size-5" />}
                      action={
                        <Link
                          href="/tambayan/friends"
                          className="home-text-action"
                        >
                          Find a friend{" "}
                          <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      }
                    >
                      Add a friend and start a conversation. Your recent DMs
                      will live here.
                    </EmptyState>
                  )}
                </section>
                <section className="surface-card home-activity">
                  <div className="home-section-title">
                    <h2>On your radar</h2>
                    <span className="section-kicker">ACTIVITY</span>
                  </div>
                  {mentions.length || incoming ? (
                    <ul className="home-activity-list">
                      {incoming > 0 && (
                        <li>
                          <Link href="/tambayan/friends">
                            <Users className="size-4" aria-hidden />
                            <span>
                              {incoming} friend request
                              {incoming === 1 ? "" : "s"} waiting
                            </span>
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        </li>
                      )}
                      {mentions.slice(0, 4).map(([id, channel]) => (
                        <li key={id}>
                          <Link href={`/tambayan/${channel.serverId}/${id}`}>
                            <span className="home-mention-count">
                              {channel.mentions}
                            </span>
                            <span className="truncate">
                              {servers.find(
                                (server) => server.id === channel.serverId,
                              )?.name ?? "Your tambayan"}
                              <small>Unread mentions</small>
                            </span>
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="A little breathing room"
                      icon={<Compass className="size-5" />}
                    >
                      You&apos;re caught up on mentions and friend requests.
                      Make room for something new.
                    </EmptyState>
                  )}
                </section>
                <section id="your-tambayans" className="home-tambayans">
                  <div className="home-section-title">
                    <h2>Your tambayans</h2>
                    <Link href="/tambayan/explore">
                      Explore <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                  {servers.length ? (
                    <ul className="home-server-grid">
                      {servers.map((server) => (
                        <li key={server.id} className="surface-card">
                          <Link
                            href={`/tambayan/${server.id}`}
                            className="home-server-link"
                          >
                            <ServerIcon server={server} size={40} />
                            <span>
                              <strong>{server.name}</strong>
                              <small>
                                {server.description ||
                                  "Your space to hang out."}
                              </small>
                            </span>
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                          <Link
                            href={`/tambayan/${server.id}/workspace`}
                            className="home-workspace-link"
                          >
                            <LayoutGrid className="size-3" aria-hidden /> Open
                            shared workspace{" "}
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="surface-card">
                      <EmptyState
                        title="Make a space for your people"
                        icon={<LayoutGrid className="size-5" />}
                      >
                        Create a tambayan, join with an invite, or discover a
                        community below.
                      </EmptyState>
                    </div>
                  )}
                </section>
                <section className="surface-card home-events">
                  <div className="home-section-title">
                    <h2>Coming together</h2>
                    <CalendarDays
                      className="size-4 text-slate-400"
                      aria-hidden
                    />
                  </div>
                  {eventsUnavailable ? (
                    <div className="p-4 text-sm text-slate-400" role="status">
                      Events couldn&apos;t load.
                      <button
                        type="button"
                        onClick={() => router.refresh()}
                        className="home-text-action mt-2"
                      >
                        Try again
                      </button>
                    </div>
                  ) : events.length ? (
                    <ul className="home-event-list">
                      {events.map((event) => (
                        <li key={event.id}>
                          <Link
                            href={`/tambayan/${event.server_id}?event=${event.id}`}
                          >
                            <span className="home-event-icon">
                              <CalendarDays className="size-4" aria-hidden />
                            </span>
                            <span>
                              <strong>{event.name}</strong>
                              <small>
                                {eventStatus(event) === "live" ? (
                                  "Happening now"
                                ) : (
                                  <Timestamp iso={event.starts_at} />
                                )}
                              </small>
                              <small>
                                {
                                  servers.find(
                                    (server) => server.id === event.server_id,
                                  )?.name
                                }
                              </small>
                            </span>
                            <ArrowRight className="size-3" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      title="The next plan is yours"
                      icon={<CalendarDays className="size-5" />}
                    >
                      Upcoming events from your tambayans will appear here.
                      Schedule one from a community&apos;s Events menu.
                    </EmptyState>
                  )}
                </section>
                <section className="surface-card home-voice">
                  <div className="home-section-title">
                    <h2>Room for a conversation</h2>
                    <Headphones className="size-4 text-slate-400" aria-hidden />
                  </div>
                  {servers.length ? (
                    servers
                      .slice(0, 3)
                      .map((server) => (
                        <HomeVoiceActivity key={server.id} server={server} />
                      ))
                  ) : (
                    <EmptyState
                      title="Find your voice"
                      icon={<Headphones className="size-5" />}
                    >
                      Join a tambayan to see its active voice rooms.
                    </EmptyState>
                  )}
                </section>
                <section className="surface-card home-people">
                  <div className="home-section-title">
                    <h2>Your people</h2>
                    <Link href="/tambayan/friends">
                      Friends <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  </div>
                  {friends.length ? (
                    <ul>
                      {friends.slice(0, 5).map(({ userId }) => {
                        const profile = social?.profiles.get(userId);
                        return profile ? (
                          <li key={userId}>
                            <Link
                              href="/tambayan/friends"
                              className="home-person"
                            >
                              <UserAvatar profile={profile} size={32} />
                              <span>
                                <strong>{profile.display_name}</strong>
                                <small>
                                  {profile.custom_status ||
                                    `@${profile.username}`}
                                </small>
                              </span>
                            </Link>
                          </li>
                        ) : null;
                      })}
                    </ul>
                  ) : (
                    <EmptyState
                      title="Better with your barkada"
                      icon={<Users className="size-5" />}
                    >
                      Find a friend by username and bring them into your day.
                    </EmptyState>
                  )}
                </section>
              </div>
              <div className="home-quick-actions">
                <button type="button" onClick={() => setDialog("create")}>
                  <Plus className="size-4" aria-hidden />
                  <span>
                    <strong>Create a server</strong>
                    <small>A space of your own</small>
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <button type="button" onClick={() => setDialog("join")}>
                  <Compass className="size-4" aria-hidden />
                  <span>
                    <strong>Join with an invite</strong>
                    <small>Meet your people there</small>
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <Link href="/tambayan/friends">
                  <Users className="size-4" aria-hidden />
                  <span>
                    <strong>Add friends</strong>
                    <small>Start a new conversation</small>
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </WorkspacePanel>
      <AddServerDialog
        key={dialog ?? "closed"}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        initialTab={dialog ?? "create"}
      />
    </>
  );
}

function HomeVoiceActivity({ server }: { server: Server }) {
  const { data, problem, retry } = useVoicePreview(server.id);
  const rooms =
    data?.channels.filter((channel) => channel.count > 0).slice(0, 2) ?? [];
  return (
    <div className="home-voice-server">
      <p className="section-kicker">{server.name}</p>
      {problem ? (
        <button type="button" onClick={retry} className="home-text-action">
          Retry voice activity
        </button>
      ) : data == null ? (
        <p className="text-xs text-slate-400" role="status">
          Checking rooms…
        </p>
      ) : rooms.length ? (
        rooms.map((room) => (
          <Link
            key={room.id}
            href={`/tambayan/${server.id}/${room.id}`}
            className="home-voice-room"
          >
            <Headphones className="size-4 text-signal-green" aria-hidden />
            <span>
              <strong>{room.name}</strong>
              <small>{room.count} in voice</small>
            </span>
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        ))
      ) : (
        <Link
          href={`/tambayan/${server.id}`}
          className="home-voice-room text-slate-400"
        >
          Quiet for now. Be the first to drop in.
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}
