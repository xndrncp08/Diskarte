"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, LayoutGrid, MessagesSquare, Radio, ScrollText, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Timestamp } from "@/components/chat/Timestamp";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalRuntimeConfig } from "@/components/providers/RuntimeConfig";
import { useServer } from "@/components/providers/ServerProvider";
import { useServerControls } from "@/components/server/ChannelSidebar";
import { useJoinRequestCount } from "@/components/server/JoinScreening";
import { communityAccent, communityBanner, landingTiles } from "@/lib/community-identity";
import { eventStatus, type ServerEvent } from "@/lib/events";
import { firstTextChannel, groupChannels, SERVER_CATEGORIES, type Channel } from "@/lib/servers";
import { AvatarStack, Monogram } from "../Avatar";
import { Button } from "../Button";
import { BentoGrid, BentoTile } from "../Card";
import { Chip } from "../Chip";
import { NavItem } from "../Nav";
import { RoomRow } from "../shell/Rooms";
import { usePulseUI } from "../shell/PulseUI";
import { Masthead } from "../shell/Masthead";

export type LandingEvent = Pick<ServerEvent, "id" | "name" | "starts_at" | "ends_at">;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const LINK = "inline-flex min-h-11 items-center gap-1 rounded-pulse-control font-semibold text-pulse-accent-ink hover:underline";

function TileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={LINK}>
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/**
 * A Space's front page in Pulse (`/tambayan/[serverId]`): a header (name, tagline, members, the community's banner and
 * accent when set) over a bento of what's here. Everything comes from useServer() (the RLS-scoped bundle the layout
 * loaded after its membership guard) and the page's events query; moderator tiles need the moderator role, and the
 * join-request count is itself RLS-scoped. Banner and accent are read defensively (absent before their migration).
 */
export function CommunityLanding({ events, eventsUnavailable = false }: { events: LandingEvent[]; eventsUnavailable?: boolean }) {
  const { server, channels, members, myRole, roles, presence } = useServer();
  const { me } = useMe();
  const config = useOptionalRuntimeConfig();
  const { openContext } = usePulseUI();
  const { setDialog, dialogs, canManageChannels, mutes } = useServerControls();
  const requests = useJoinRequestCount();
  const tiles = new Set(landingTiles({ myRole, isSystem: server.is_system, joinApproval: server.join_approval ?? false }));
  const banner = communityBanner(server.banner_url ?? null, config?.supabaseUrl);
  const accent = communityAccent(server.accent_color ?? null);
  const online = members.filter((m) => presence.has(m.user_id));
  const first = firstTextChannel(channels);
  const welcomeRoom = channels.find((c) => c.id === server.welcome_channel_id) ?? first;
  const welcome = server.welcome_message?.replaceAll("{user}", me.display_name).replaceAll("{server}", server.name).trim();
  const boards = channels.filter((c) => c.type === "forum");
  const category = SERVER_CATEGORIES.find((c) => c.id === server.category)?.label;
  const tagline = server.description?.trim() || "Your space to hang out.";
  const row = (c: Channel, place: "live" | "category") => <RoomRow key={`${place}:${c.id}`} channel={c} active={false} canManage={canManageChannels} muted={mutes.muted.has(c.id)} onDialog={setDialog} place={place} />;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col font-pulse-text text-pulse-text" data-testid="community-landing">
      <Masthead eyebrow={server.is_system ? "Official Space" : "Space"} title={server.name} description={`${plural(members.length, "member")} · ${online.length} online`} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
          <header className="overflow-hidden rounded-pulse-card border border-pulse-line bg-pulse-surface shadow-pulse-1" data-testid="community-hero">
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element -- allow-listed storage URL; decorative, the name is the h1 above
              <img src={banner} alt="" className="h-32 w-full object-cover md:h-44" referrerPolicy="no-referrer" data-testid="community-banner" />
            ) : accent ? (
              <div className="flex h-20 items-end px-5 pb-3 md:h-28" style={accent} data-testid="community-accent">
                <p className="font-pulse-display text-pulse-lead font-semibold">{server.name}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-4 p-5">
              <Monogram name={server.name} src={server.icon_url} size={56} />
              <div className="min-w-0 flex-1">
                <p className="text-pulse-lead text-pulse-text">{tagline}</p>
                <p className="mt-1 text-pulse-label text-pulse-muted">
                  {plural(members.length, "member")} · {online.length} online{category ? ` · ${category}` : ""}
                </p>
              </div>
              {first && (
                <Link href={`/tambayan/${server.id}/${first.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-pulse-control bg-pulse-accent px-4 font-semibold text-pulse-on-accent shadow-pulse-1 hover:brightness-105">
                  Open #{first.name} <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </div>
          </header>

          <h2 className="sr-only">What&apos;s here</h2>
          <BentoGrid>
            <BentoTile span="tall" eyebrow="Rooms" title="Where people are" className="sm:col-span-2" data-testid="tile-rooms">
              {/* Live voice rooms first, then the rest in their categories (the navigator's rows and menus). */}
              <div className="-mx-3 max-h-96 overflow-y-auto">
                <ul aria-label="Live rooms">{channels.filter((c) => c.type === "voice").map((c) => row(c, "live"))}</ul>
                <ul aria-label="All rooms">{groupChannels(channels).flatMap(({ channels: list }) => list.map((c) => row(c, "category")))}</ul>
              </div>
            </BentoTile>

            {tiles.has("events") && (
              <BentoTile eyebrow="Events" title="Coming up" data-testid="tile-events">
                {eventsUnavailable ? (
                  <p role="status">Events couldn&apos;t load. Refresh to try again.</p>
                ) : events.length ? (
                  <ul className="space-y-1">
                    {events.map((e) => (
                      <li key={e.id}>
                        <NavItem href={`/tambayan/${server.id}?event=${e.id}`} leading={<CalendarDays />} label={e.name} secondary={eventStatus(e) === "live" ? "Happening now" : <Timestamp iso={e.starts_at} />} live={eventStatus(e) === "live"} className="-mx-3 w-auto" />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No events planned yet.{canManageChannels ? " Schedule one from a room's Events menu." : ""}</p>
                )}
              </BentoTile>
            )}

            {tiles.has("rules") && (
              <BentoTile eyebrow="Start here" title={server.rules?.trim() ? "Rules and welcome" : "Getting started"} data-testid="tile-rules">
                {welcome && <p className="mb-2 line-clamp-3 text-pulse-text">{welcome}</p>}
                {server.rules?.trim() && (
                  <p className="mb-2 line-clamp-4 whitespace-pre-line">
                    <ScrollText className="mr-1 inline size-4 align-text-bottom" aria-hidden />
                    {server.rules.trim()}
                  </p>
                )}
                {!welcome && !server.rules?.trim() && <p>Say hello and introduce yourself.</p>}
                {welcomeRoom && <TileLink href={`/tambayan/${server.id}/${welcomeRoom.id}`}>Say hello in #{welcomeRoom.name}</TileLink>}
              </BentoTile>
            )}

            {tiles.has("members") && (
              <BentoTile eyebrow="People" title={plural(members.length, "member")} data-testid="tile-members">
                <AvatarStack people={(online.length ? online : members).map((m) => m.profile)} max={5} size={32} />
                <p className="mt-2">{online.length} online now</p>
                {roles.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Roles">
                    {roles.slice(0, 5).map((r) => <li key={r.id}><Chip tone="people">{r.name}</Chip></li>)}
                  </ul>
                )}
                <Button variant="quiet" size="sm" className="-ml-3 mt-1" icon={<Users />} onClick={() => openContext("people")}>See everyone</Button>
              </BentoTile>
            )}

            {tiles.has("workspace") && (
              <BentoTile eyebrow="Workspace" title="Shared workspace" data-testid="tile-workspace">
                <p>Notes, plans and files the Space keeps together.</p>
                <TileLink href={`/tambayan/${server.id}/workspace`}>Open workspace</TileLink>
              </BentoTile>
            )}

            {tiles.has("boards") && (
              <BentoTile eyebrow="Boards" title="Find a group, share ideas" data-testid="tile-boards">
                <ul>
                  <li><NavItem href={`/tambayan/${server.id}/lfg`} leading={<Radio />} label="LFG Board" secondary="Looking for group" className="-mx-3 w-auto" /></li>
                  {boards.map((b) => (
                    <li key={b.id}><NavItem href={`/tambayan/${server.id}/${b.id}`} leading={b.forum_mode === "suggestions" ? <LayoutGrid /> : <MessagesSquare />} label={b.name} secondary={b.forum_mode === "suggestions" ? "Suggestion board" : "Forum"} className="-mx-3 w-auto" /></li>
                  ))}
                </ul>
              </BentoTile>
            )}

            {tiles.has("invite") && (
              <BentoTile eyebrow="Invite" title="Bring your barkada" data-testid="tile-invite">
                <p>Share an invite link to {server.name}.</p>
                <Button className="mt-3" icon={<UserPlus />} onClick={() => setDialog({ kind: "invite" })}>Invite people</Button>
              </BentoTile>
            )}

            {tiles.has("requests") && (
              <BentoTile eyebrow="Moderators" title="Join requests" data-testid="tile-requests">
                <p>{requests ? `${requests === 1 ? "1 person is" : `${requests} people are`} waiting to join.` : "No one is waiting."}</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDialog({ kind: "settings", tab: "membership" })}>Review requests</Button>
              </BentoTile>
            )}
          </BentoGrid>
        </div>
      </div>
      {dialogs}
    </section>
  );
}
