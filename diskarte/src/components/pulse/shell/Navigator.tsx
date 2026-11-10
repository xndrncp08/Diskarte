"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { Compass, Home, Inbox, MessageCircle, Pin, PinOff, Plus, Search, Settings, ShieldCheck, Sparkles, Undo2, Users } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePlatformRole } from "@/components/admin/AdminAccess";
import { useMe } from "@/components/providers/MeProvider";
import { useSettingsDialog } from "@/components/profile/SettingsDialog";
import { useSocial } from "@/components/providers/SocialProvider";
import { AddServerDialog } from "@/components/shell/AddServerDialog";
import { ServerContextMenu } from "@/components/shell/ServerContextMenu";
import { readOrder, serverHref, sortByOrder, subscribeOrder, useServerBadge, useServerHref, type RailEntry } from "@/components/shell/ServerRail";
import { useStatusMenu } from "@/components/shell/UserPanel";
import { ConversationAvatar, GroupDmForm } from "@/components/social/HomeSidebar";
import { StartHangoutDialog, useNow } from "@/components/social/Hangouts";
import { Modal } from "@/components/ui/Modal";
import { useCall } from "@/components/voice/CallProvider";
import { NotificationHub } from "@/components/workspace/NotificationHub";
import { useGoAnywhere } from "@/components/workspace/WorkspaceControls";
import { readLastChannels } from "@/lib/last-channel";
import { togglePin, useDisplayPrefs } from "@/lib/display-prefs";
import { hangoutTimeLeft, topicLabel } from "@/lib/hangouts";
import { setShell } from "@/lib/shell";
import { conversationTitle, isUnread, type ConversationSummary } from "@/lib/social";
import { Avatar, Monogram } from "../Avatar";
import { Button } from "../Button";
import { Kbd, SegmentedControl } from "../Controls";
import { ContextMenu, ContextMenuItems, Menu, useContextMenu, type MenuItem } from "../Menu";
import { NavItem } from "../Nav";
import { usePulseUI } from "./PulseUI";

export type NavigatorView = "home" | "people" | "spaces";

const HOME_ROUTES = new Set(["explore", "search", "admin"]);
const PEOPLE_ROUTES = new Set(["dm", "messages", "friends"]);

/** Which view a route belongs to: a conversation shows People, a Space shows Spaces, the rest Home. */
export function viewFor(pathname: string): NavigatorView {
  const segment = pathname.split("/")[2];
  if (!segment || HOME_ROUTES.has(segment)) return "home";
  return PEOPLE_ROUTES.has(segment) ? "people" : "spaces";
}

/** HQ first, then the Spaces in the order saved on the Classic rail (one order for both shells). */
export function useSpaces(servers: RailEntry[]) {
  const saved = useSyncExternalStore(subscribeOrder, readOrder, () => "");
  const hq = servers.filter((s) => s.is_system);
  const byId = new Map(servers.filter((s) => !s.is_system).map((s) => [s.id, s]));
  return [...hq, ...sortByOrder([...byId.keys()], saved).flatMap((id) => byId.get(id) ?? [])];
}

const SECTION = "px-3 pb-1 pt-4 text-pulse-caption font-semibold uppercase tracking-wide text-pulse-muted";

function pinItem(pin: string, pinned: boolean): MenuItem {
  return { label: pinned ? "Unpin" : "Pin to top", icon: pinned ? <PinOff /> : <Pin />, onSelect: () => togglePin(pin) };
}

/** A Space: Monogram, unread and mention counts (muted channels ignored), "In call" while you're in its voice room. */
function SpaceRow({ server, active, pinned, actions, children }: { server: RailEntry; active: boolean; pinned: boolean; actions?: (el: HTMLElement | null) => void; children?: ReactNode }) {
  const menu = useContextMenu();
  const href = useServerHref(server);
  const badge = useServerBadge(server.id);
  const call = useCall();
  const live = call.status !== "idle" && call.target?.serverId === server.id ? "In call" : undefined;
  return (
    <li {...menu.triggerProps}>
      <div className="flex items-center gap-1">
        <NavItem label={server.name} leading={<Monogram name={server.name} src={server.icon_url} size={28} selected={active} />} href={href} current={active} unread={badge.unread} count={active ? 0 : badge.mentions} countLabel={badge.mentions === 1 ? "mention" : "mentions"} live={live} dimmed={badge.muted} className="min-w-0 flex-1" />
        {/* The open Space's "…" menu and Invite portal in here from its layout (they need its ServerProvider). */}
        {actions && <span ref={actions} className="flex shrink-0 items-center" />}
      </div>
      {children}
      <ServerContextMenu menu={menu} server={server} before={[pinItem(`space:${server.id}`, pinned)]} />
    </li>
  );
}

/** A direct or group conversation, with its hangout timer; right-click to pin or mark it read. */
function ConversationRow({ conversation: c, active, pinned }: { conversation: ConversationSummary; active: boolean; pinned: boolean }) {
  const menu = useContextMenu();
  const { markRead } = useSocial();
  const unread = !active && isUnread(c);
  const now = useNow();
  const secondary = c.hangoutUntil ? `${topicLabel(c.hangoutTopic)} · ${hangoutTimeLeft(c.hangoutUntil, now)}` : c.kind === "group" ? `${c.others.length + 1} members` : undefined;
  return (
    <li {...menu.triggerProps}>
      <NavItem label={conversationTitle(c)} secondary={secondary} leading={<ConversationAvatar conversation={c} size={28} />} href={`/tambayan/dm/${c.id}`} current={active} unread={unread} />
      <ContextMenu menu={menu} label={`${conversationTitle(c)} options`}>
        <ContextMenuItems items={[pinItem(`dm:${c.id}`, pinned), { label: "Mark as read", icon: <Inbox />, onSelect: () => markRead(c.id), hidden: !unread }]} />
      </ContextMenu>
    </li>
  );
}

/** "You": your face and status in the navigator header; status, Settings, the Control Center (super admins) and Classic. */
function YouMenu() {
  const { me } = useMe();
  const { items, label } = useStatusMenu();
  const settings = useSettingsDialog();
  const role = usePlatformRole();
  const router = useRouter();
  const status = me.status === "invisible" ? "offline" : me.status;
  const more: MenuItem[] = [
    { label: "Settings", icon: <Settings />, group: "You", onSelect: () => (settings ? settings.openSettings() : router.push("/settings/profile")) },
    // Shown only when the server said so (the page itself re-checks); never derived on the client.
    { label: "Control Center", icon: <ShieldCheck />, group: "You", onSelect: () => router.push("/tambayan/admin"), hidden: role !== "super_admin" },
    { label: "Back to Classic", icon: <Undo2 />, group: "You", onSelect: () => setShell("classic", router) },
  ];
  return (
    <Menu
      label="You"
      items={[...more, ...items]}
      trigger={({ toggle, open, id }) => (
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id} aria-haspopup="menu" aria-label={`You: ${me.display_name}, ${label}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-pulse-control hover:bg-pulse-hover" data-testid="you-button">
          <Avatar profile={me} size={32} status={status} />
        </button>
      )}
    />
  );
}

/**
 * The Spaces navigator: Pulse's one navigation column (no server rail). Header (brand, notifications, You), a
 * Home · People · Spaces switch, "Jump to…" (the ⌘K palette), your pins, then the chosen view. Every list comes
 * from an RLS-scoped source: `servers` (getMyServers), useSocial() conversations, and for the open Space the rooms
 * that `[serverId]/layout.tsx` portals into the slot (useServer().channels).
 *
 * Keys: Alt (Option) 1–9 open the first nine Spaces (not while typing), ↑/↓ (Home/End) move between rows, Escape returns to the canvas.
 */
export function Navigator({ servers }: { servers: RailEntry[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = useParams<{ serverId?: string }>().serverId;
  const { conversations, friends, profiles, attention } = useSocial();
  const role = usePlatformRole();
  const { setRoomsSlot, setSpaceActionsSlot } = usePulseUI();
  const pins = useDisplayPrefs().pins ?? [];
  const goAnywhere = useGoAnywhere(servers);
  const spaces = useSpaces(servers);
  // The route picks the view; a choice sticks until the next navigation.
  const [chosen, setChosen] = useState<{ view: NavigatorView; path: string } | null>(null);
  const view = chosen?.path === pathname ? chosen.view : viewFor(pathname);
  const [dialog, setDialog] = useState<"space" | "hangout" | "group" | null>(null);
  const incoming = friends?.filter((f) => f.status === "incoming").length ?? 0;

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // Alt (Option) + digit: browsers keep ⌘/Ctrl + 1–9 for their tabs. Match the key position, since Option + digit types a symbol on macOS.
      const digit = /^Digit([1-9])$/.exec(event.code)?.[1];
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || !digit || document.querySelector('[role="dialog"]')) return;
      // While typing, Option + digit is a character (¡, ™…): leave it to the field.
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable=true]")) return;
      const space = spaces[Number(digit) - 1];
      if (!space) return;
      event.preventDefault();
      router.push(serverHref(space, readLastChannels()));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [spaces, router]);

  // A DOM listener, not onKeyDown: the rooms are portalled in from another React tree (the server layout), so only
  // DOM bubbling reaches here from them; menus portal out to <body>, so their keys never do.
  const [nav, setNav] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!nav) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        document.getElementById("main-content")?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = Array.from(nav.querySelectorAll<HTMLElement>("a[href], button"));
      const index = rows.indexOf(event.target as HTMLElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)));
      rows[next]?.focus();
    };
    nav.addEventListener("keydown", onKeyDown);
    return () => nav.removeEventListener("keydown", onKeyDown);
  }, [nav]);

  const pinnedSpaces = pins.flatMap((p) => (p.startsWith("space:") ? (spaces.find((s) => `space:${s.id}` === p) ?? []) : []));
  const pinnedConversations = pins.flatMap((p) => (p.startsWith("dm:") ? ((conversations ?? []).find((c) => `dm:${c.id}` === p) ?? []) : []));
  const accepted = (friends ?? []).filter((f) => f.status === "accepted");

  return (
    <aside aria-label="Navigator" className="flex h-full w-full min-w-0 flex-col bg-pulse-bg font-pulse-text text-pulse-text">
      <div className="flex items-center gap-1 px-3 pb-2 pt-3">
        <span className="min-w-0 flex-1 truncate font-pulse-display text-pulse-title font-semibold">Diskarte</span>
        <NotificationHub servers={servers} />
        <YouMenu />
      </div>
      <div className="space-y-2 px-3">
        <SegmentedControl<NavigatorView>
          label="Navigator view"
          value={view}
          onChange={(next) => setChosen({ view: next, path: pathname })}
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "home", label: "Home" },
            { value: "people", label: "People" },
            { value: "spaces", label: "Spaces" },
          ]}
        />
        <Button variant="secondary" icon={<Search />} onClick={goAnywhere.open} aria-keyshortcuts="Control+k Meta+k" className="w-full justify-start text-pulse-muted">
          <span className="flex-1 text-left">Jump to…</span>
          <span className="max-md:hidden" aria-hidden><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></span>
        </Button>
      </div>

      <nav aria-label={`${view === "home" ? "Home" : view === "people" ? "People" : "Spaces"} navigation`} ref={setNav} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4" data-testid="pulse-navigator">
        {pinnedSpaces.length + pinnedConversations.length > 0 && (
          <section aria-labelledby="pulse-pinned">
            <h2 id="pulse-pinned" className={SECTION}>Pinned</h2>
            <ul>
              {pinnedSpaces.map((s) => <SpaceRow key={s.id} server={s} active={activeId === s.id} pinned />)}
              {pinnedConversations.map((c) => <ConversationRow key={c.id} conversation={c} active={pathname === `/tambayan/dm/${c.id}`} pinned />)}
            </ul>
          </section>
        )}

        {view === "home" && (
          <ul className="pt-2">
            <li><NavItem label="Home" leading={<Home />} href="/tambayan" current={pathname === "/tambayan"} /></li>
            <li><NavItem label="Friends" leading={<Users />} href="/tambayan/friends" current={pathname === "/tambayan/friends"} count={incoming} countLabel={incoming === 1 ? "friend request" : "friend requests"} countTone="accent" /></li>
            <li><NavItem label="Messages" leading={<MessageCircle />} href="/tambayan/messages" current={pathname === "/tambayan/messages"} count={attention} countLabel="unread" /></li>
            <li><NavItem label="Explore" leading={<Compass />} href="/tambayan/explore" current={pathname === "/tambayan/explore"} /></li>
            <li><NavItem label="Search" leading={<Search />} href="/tambayan/search" current={pathname === "/tambayan/search"} /></li>
            {role === "super_admin" && <li><NavItem label="Control Center" leading={<ShieldCheck />} href="/tambayan/admin" current={pathname === "/tambayan/admin"} /></li>}
          </ul>
        )}

        {view === "people" && (
          <>
            <div className="flex gap-2 px-1 pt-2">
              <Button size="sm" icon={<Sparkles />} onClick={() => setDialog("hangout")} className="flex-1">Start a Hangout</Button>
              <Button size="sm" variant="quiet" icon={<Plus />} onClick={() => setDialog("group")}>Group</Button>
            </div>
            <ul className="pt-2">
              <li><NavItem label="Friends" leading={<Users />} href="/tambayan/friends" current={pathname === "/tambayan/friends"} count={incoming} countLabel={incoming === 1 ? "friend request" : "friend requests"} countTone="accent" /></li>
            </ul>
            <h2 className={SECTION}>Direct messages</h2>
            {conversations === null ? (
              <p className="px-3 py-2 text-pulse-label text-pulse-muted" role="status">Loading conversations…</p>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-2 text-pulse-label text-pulse-muted">No conversations yet. Add some friends!</p>
            ) : (
              <ul data-testid="dm-list">
                {conversations.map((c) => <ConversationRow key={c.id} conversation={c} active={pathname === `/tambayan/dm/${c.id}`} pinned={pins.includes(`dm:${c.id}`)} />)}
              </ul>
            )}
          </>
        )}

        {view === "spaces" && (
          <>
            <h2 className={SECTION}>Spaces</h2>
            <ul data-testid="space-list">
              {spaces.map((s) => (
                <SpaceRow key={s.id} server={s} active={activeId === s.id} pinned={pins.includes(`space:${s.id}`)} actions={activeId === s.id ? setSpaceActionsSlot : undefined}>
                  {/* The open Space's rooms (and its menu) portal in here from [serverId]/layout.tsx. */}
                  {activeId === s.id && <div ref={setRoomsSlot} className="pb-2 pl-3" />}
                </SpaceRow>
              ))}
            </ul>
            <ul className="pt-2">
              <li><NavItem label="Add a Space" leading={<Plus />} onClick={() => setDialog("space")} /></li>
              <li><NavItem label="Explore Spaces" leading={<Compass />} href="/tambayan/explore" current={pathname === "/tambayan/explore"} /></li>
            </ul>
          </>
        )}
      </nav>

      {goAnywhere.palette}
      <AddServerDialog open={dialog === "space"} onClose={() => setDialog(null)} />
      <StartHangoutDialog open={dialog === "hangout"} onClose={() => setDialog(null)} />
      <Modal open={dialog === "group"} onClose={() => setDialog(null)} title="New group DM">
        <GroupDmForm friendIds={accepted.map((f) => f.userId)} profiles={profiles} onDone={() => setDialog(null)} />
      </Modal>
    </aside>
  );
}
