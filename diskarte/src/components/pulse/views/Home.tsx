"use client";

import Link from "next/link";
import { ArrowRight, AtSign, CalendarDays, Compass, Headphones, Home as HomeIcon, MessageSquare, Plus, RefreshCw, Sparkles, UserPlus, Users, Volume2 } from "lucide-react";
import type { ReactNode } from "react";
import { Timestamp } from "@/components/chat/Timestamp";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalSocial } from "@/components/providers/SocialProvider";
import { GettingStarted, WhatsNew } from "@/components/shell/GettingStarted";
import { MomentsStrip } from "@/components/social/Moments";
import { ConversationAvatar } from "@/components/social/HomeSidebar";
import { callHref, useCall } from "@/components/voice/CallProvider";
import { activityStatus, type FriendActivity } from "@/hooks/useFriendsActivity";
import { useVoicePreview } from "@/hooks/useVoicePreview";
import { eventStatus, type ServerEvent } from "@/lib/events";
import { hangoutTimeLeft, topicLabel } from "@/lib/hangouts";
import { useLocale } from "@/lib/locale";
import type { Server } from "@/lib/servers";
import { conversationTitle, isUnread, type ConversationSummary, type FriendEntry } from "@/lib/social";
import { Avatar, Monogram } from "../Avatar";
import { Button, IconButton } from "../Button";
import { BentoGrid, BentoTile } from "../Card";
import { NavItem } from "../Nav";
import { Masthead } from "../shell/Masthead";

type HomeEvent = Pick<ServerEvent, "id" | "server_id" | "name" | "starts_at" | "ends_at">;
type Mention = [channelId: string, channel: { serverId: string; mentions: number }];

const ROW = "-mx-3 w-auto";

/** A quiet empty tile: a neutral icon and one line saying what will appear. */
function EmptyStateLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex text-pulse-faint [&_svg]:size-4" aria-hidden>{icon}</span>
      {children}
    </p>
  );
}

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mt-auto inline-flex min-h-11 items-center gap-1 self-start font-semibold text-pulse-accent-ink hover:underline">
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** One Space's occupied voice rooms (the same voice preview Classic Home reads). */
function VoiceRooms({ server }: { server: Server }) {
  const { data, problem, retry } = useVoicePreview(server.id);
  const rooms = data?.channels.filter((c) => c.count > 0).slice(0, 2) ?? [];
  if (problem) return <li><Button variant="quiet" size="sm" className="-ml-3" onClick={retry}>Retry {server.name}</Button></li>;
  return rooms.map((room) => (
    <li key={room.id}>
      <NavItem href={`/tambayan/${server.id}/${room.id}`} leading={<Volume2 />} label={room.name} secondary={server.name} live={`${room.count} in voice`} className={ROW} />
    </li>
  ));
}

/**
 * Home in Pulse: "Where should I go next?" as a bento of what HomeView already computes (conversations, mentions and
 * requests, friends around and Hangouts, live voice, events, your Spaces). Same data and dialogs as Classic, no feed.
 */
export function PulseHome({ servers, events, eventsUnavailable, fresh, conversations, mentions, incoming, friends, around, hangouts, activity, now, onDialog, onHangout, onRefresh }: {
  servers: Server[]; events: HomeEvent[]; eventsUnavailable: boolean; fresh: boolean; conversations: ConversationSummary[] | null | undefined; mentions: Mention[]; incoming: number;
  friends: FriendEntry[]; around: FriendEntry[]; hangouts: ConversationSummary[]; activity: Map<string, FriendActivity> | null; now: number;
  onDialog: (dialog: "create" | "join") => void; onHangout: (userIds: string[]) => void; onRefresh: () => void;
}) {
  const { me } = useMe();
  const { t } = useLocale();
  const social = useOptionalSocial();
  const call = useCall();
  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? "Your Space";
  const people = friends.slice(0, 5).flatMap(({ userId }) => {
    const profile = social?.profiles.get(userId);
    return profile ? [{ userId, profile, live: activity?.get(userId) }] : [];
  });

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text" data-testid="smart-tambay">
      <Masthead
        eyebrow="Smart Tambay"
        title="Home"
        icon={<HomeIcon />}
        description={fresh ? `${t("Welcome to Diskarte")}, ${me.display_name}!` : `${t("Welcome back")}, ${me.display_name}!`}
        actions={<IconButton tooltip label="Refresh home" icon={<RefreshCw />} onClick={onRefresh} />}
      />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6" data-pulse-home="">
          <WhatsNew />
          <GettingStarted servers={servers} onCreate={() => onDialog("create")} />
          <MomentsStrip />
          <h2 className="font-pulse-display text-pulse-heading font-semibold">Where should I go next?</h2>
          <BentoGrid>
            <BentoTile span="wide" eyebrow="Messages" title="Pick up the conversation" data-testid="home-conversations">
              {conversations == null ? (
                <p role="status">Loading conversations…</p>
              ) : conversations.length ? (
                <ul>
                  {conversations.slice(0, 4).map((c) => (
                    <li key={c.id}><NavItem href={`/tambayan/dm/${c.id}`} label={conversationTitle(c)} leading={<ConversationAvatar conversation={c} size={32} />} unread={isUnread(c)} secondary={<Timestamp iso={c.lastMessageAt} />} className={ROW} /></li>
                  ))}
                </ul>
              ) : (
                <EmptyStateLine icon={<MessageSquare />}>Add a friend and start a conversation. Your recent DMs will live here.</EmptyStateLine>
              )}
              <More href="/tambayan/messages">All messages</More>
            </BentoTile>

            <BentoTile eyebrow="Activity" title="On your radar" data-testid="home-radar">
              {mentions.length || incoming ? (
                <ul>
                  {incoming > 0 && <li><NavItem href="/tambayan/friends" leading={<UserPlus />} label="Friend requests" count={incoming} countLabel={incoming === 1 ? "request waiting" : "requests waiting"} countTone="accent" className={ROW} /></li>}
                  {mentions.slice(0, 4).map(([id, channel]) => (
                    <li key={id}><NavItem href={`/tambayan/${channel.serverId}/${id}`} leading={<AtSign />} label={serverName(channel.serverId)} secondary="Unread mentions" count={channel.mentions} countLabel={channel.mentions === 1 ? "mention" : "mentions"} className={ROW} /></li>
                  ))}
                </ul>
              ) : (
                <EmptyStateLine icon={<Compass />}>You&apos;re caught up on mentions and friend requests.</EmptyStateLine>
              )}
            </BentoTile>

            <BentoTile span="tall" eyebrow="Friends" title={around.length ? `${around.length} around now` : "Hang out now"} data-testid="home-hangouts">
              {hangouts.length > 0 && (
                <ul aria-label="Your hangouts">
                  {hangouts.map((h) => <li key={h.id}><NavItem href={`/tambayan/dm/${h.id}`} leading={<Sparkles />} label={conversationTitle(h)} secondary={`${topicLabel(h.hangoutTopic)} · ${hangoutTimeLeft(h.hangoutUntil!, now)}`} live className={ROW} /></li>)}
                </ul>
              )}
              {people.length ? (
                <ul aria-label="Your people">
                  {people.map(({ userId, profile, live }) => {
                    const voice = live?.voice_server_id ? servers.find((s) => s.id === live.voice_server_id) : undefined;
                    return (
                      <li key={userId} className="flex items-center gap-1">
                        <NavItem
                          href={voice && live?.voice_channel_id ? `/tambayan/${voice.id}/${live.voice_channel_id}` : "/tambayan/friends"}
                          leading={<Avatar profile={profile} size={32} status={activityStatus(live)} />}
                          label={profile.display_name}
                          secondary={voice ? `In voice · ${voice.name}` : profile.custom_status || (live ? (live.status === "dnd" ? "Busy" : "Around now") : `@${profile.username}`)}
                          className="-ml-3 min-w-0 flex-1"
                        />
                        <IconButton size="sm" tooltip label={`Hang out with ${profile.display_name}`} icon={<Sparkles />} onClick={() => onHangout([userId])} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>A temporary space with voice and chat for right now. It cleans itself up afterwards.</p>
              )}
              <Button variant="primary" className="mt-3 self-start" icon={<Sparkles />} onClick={() => onHangout([])}>Start a Hangout</Button>
            </BentoTile>

            <BentoTile eyebrow="Voice" title="Live rooms" data-testid="home-voice">
              <ul className="peer">
                {call.target && call.status !== "idle" && (
                  <li><NavItem href={callHref(call.target)} leading={<Headphones />} label={call.target.channelName} secondary={call.status === "connected" ? "You're here. Jump back in." : `${call.status}…`} live className={ROW} /></li>
                )}
                {servers.slice(0, 3).map((s) => <VoiceRooms key={s.id} server={s} />)}
              </ul>
              <p className="text-pulse-label peer-has-[li]:hidden">Quiet for now. Drop into a room and others will follow.</p>
            </BentoTile>

            <BentoTile eyebrow="Events" title="Coming together" data-testid="home-events">
              {eventsUnavailable ? (
                <p role="status">Events couldn&apos;t load. <Button variant="quiet" size="sm" onClick={onRefresh}>Try again</Button></p>
              ) : events.length ? (
                <ul>
                  {events.map((e) => (
                    <li key={e.id}><NavItem href={`/tambayan/${e.server_id}?event=${e.id}`} leading={<CalendarDays />} label={e.name} secondary={eventStatus(e) === "live" ? `Happening now · ${serverName(e.server_id)}` : <><Timestamp iso={e.starts_at} /> · {serverName(e.server_id)}</>} live={eventStatus(e) === "live"} className={ROW} /></li>
                  ))}
                </ul>
              ) : (
                <EmptyStateLine icon={<CalendarDays />}>Upcoming events from your Spaces will appear here.</EmptyStateLine>
              )}
            </BentoTile>

            <BentoTile span="wide" eyebrow="Spaces" title="Your Spaces" id="your-tambayans" data-testid="home-spaces">
              {servers.length ? (
                <ul className="grid gap-x-3 sm:grid-cols-2">
                  {servers.slice(0, 6).map((s) => <li key={s.id}><NavItem href={`/tambayan/${s.id}`} leading={<Monogram name={s.name} src={s.icon_url} size={32} />} label={s.name} secondary={s.description || "Your space to hang out."} className={ROW} /></li>)}
                </ul>
              ) : (
                <EmptyStateLine icon={<Users />}>Create a Space, join with an invite, or find one in Explore.</EmptyStateLine>
              )}
              <More href="/tambayan/explore">Explore Spaces</More>
            </BentoTile>

            <BentoTile span="wide" eyebrow="Start something" title="Make a new space" data-testid="home-actions">
              <div className="flex flex-wrap gap-2">
                <Button icon={<Plus />} onClick={() => onDialog("create")}>Create a server</Button>
                <Button icon={<Compass />} onClick={() => onDialog("join")}>Join with an invite</Button>
                <Link href="/tambayan/friends" className="inline-flex h-10 items-center gap-2 rounded-pulse-control border border-pulse-input px-4 font-semibold text-pulse-text hover:bg-pulse-hover pointer-coarse:min-h-11">
                  <Users className="size-4" aria-hidden /> Add friends
                </Link>
              </div>
            </BentoTile>
          </BentoGrid>
        </div>
      </div>
    </section>
  );
}
