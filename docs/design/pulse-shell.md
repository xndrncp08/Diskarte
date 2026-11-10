# Pulse shell

The application frame of Diskarte Pulse, direction "Canvas": a **Spaces navigator** on the left, the
**Conversation Canvas** (a masthead over the page) and a **Context sheet** opened on demand. There is no server
rail, no circle-to-squircle icon, no unread pill at the left edge and no user panel in the bottom-left corner.
Built from the [Pulse components](pulse-components.md); the decision is
[ADR 017](../architecture/decisions.md#017-one-frame-mount-shell-aware-seams).

## Turning it on and off

- The `diskarte-shell` cookie picks the shell: `pulse`, or anything else (absent, `classic`, tampered) for Classic.
  Classic is the default and renders exactly as before.
- Super admins get **Settings → Appearance → Try the new Diskarte** (shown only when the server-provided
  platform role is `super_admin`). Anyone can still set the cookie by hand. The public opt-in comes later.
- Pulse's "You" menu has **Back to Classic**.
- Switching calls `setShell` ([`lib/shell.ts`](../../diskarte/src/lib/shell.ts)): it flips `<html data-shell>`,
  writes the cookie and runs `router.refresh()`. No reload, so a call stays connected.
- **Rollback:** clear the cookie (or set it to `classic`). Nothing is stored server-side.

## Architecture

```text
app/(app)/layout.tsx           AdminAccessProvider (platform role) → SessionProviders (call, presence, social…)
└─ app/(app)/tambayan/layout   reads the cookie
   └─ ShellProviders           admin access, ShellKind, layout, unreads, ShellUI, watchers, ConfirmHost
      ├─ ClassicFrame          (Classic) rail + columns
      └─ PulseShell            (Pulse) PulseUI, PulseMenuSkin, PulseTooltipSkin
         ├─ Navigator          header, Home · People · Spaces, Jump to…, Pinned, the view
         └─ canvas column      BroadcastBanner, CallStrip, the page (WorkspacePanel "main")
```

Only the frame inside `ShellProviders` changes on a switch, so the call (in `SessionProviders`), unread counts
and the membership, DM and reminder watchers stay mounted (tested in `tests/ui/pulse-shell.test.tsx`).

### Seams

Pages were not rewritten. The components they already use read `useShellKind()`
([`ShellKind.tsx`](../../diskarte/src/components/shell/ShellKind.tsx)) and take a Pulse path:

| Seam | Classic | Pulse |
| --- | --- | --- |
| `WorkspacePanel id="nav"` (HomeSidebar, ChannelSidebar) | Resizable column / phone drawer | Renders nothing: the navigator owns navigation |
| `WorkspacePanel id="main"` | `<main id="main-content">` column | The canvas: the same landmark on a Pulse surface card |
| `ChannelHeader`, `PageHeader` | `.page-header` | `Masthead`: the page's one h1 in Bricolage, the Space name, topic and member count, the page's actions, the Context toggle |
| `RosterDrawer` | Member column | `ContextPanel`: a Sheet, or a column when pinned at ≥ 1200 px |
| `MemberList` | Everyone, offline dimmed | 100 rows at a time with "Show more", offline at full contrast |
| `[serverId]/layout.tsx` | — | Renders `<PulseRooms>`, portalled into the navigator under the open Space |
| Classic tooltips and menus | Classic look | Pulse look (`PulseTooltipSkin`, `PulseMenuSkin`) |

Shared logic was lifted out of Classic components rather than copied: `useServerControls` and
`useChannelMenuItems` (ChannelSidebar), `useStatusMenu` (UserPanel), `useGoAnywhere` (WorkspaceControls),
`useServerBadge`, `useServerHref`, the saved Space order (ServerRail), `usePinnedMessages` (PinsDrawer),
`useNavDrawer` (the phone drawer's focus and Escape handling).

### The Classic bridge

Pages inside the canvas keep their Classic markup until Step 5. They read Classic tokens (`--color-midnight`,
`--color-white`, `--color-slate-*`…); inside Pulse, [`pulse.css`](../../diskarte/src/app/pulse.css) maps those
to Pulse tokens so the text stays readable on Pulse surfaces in both modes. Accent tokens are untouched (the
themes own them).

## Navigator

- **Header:** "Diskarte", the notification hub and **You** (avatar with presence): status choices, Settings,
  the Control Center (super admins only) and Back to Classic.
- **Home · People · Spaces** (SegmentedControl). The route picks the view (a DM or Friends shows People, a
  Space shows Spaces, the rest Home); a choice sticks until the next navigation.
- **Jump to…** opens the Go anywhere palette (⌘/Ctrl K).
- **Pinned:** Spaces and conversations pinned from their right-click menu.
- **Home:** Home, Friends (request count), Messages (unread count), Explore, Search, Control Center.
- **People:** Start a Hangout, a new group DM, Friends, then every conversation (hangout timers, unread dots).
- **Spaces:** Diskarte HQ, then your Spaces in the order saved on the Classic rail, each a Monogram with mention
  count, unread dot, "In call" while you're in its voice room and the Classic server menu (plus Pin). The open
  Space expands to its **rooms**: the Space menu (Classic's server menu: invite, settings, Bantay-Bayan,
  notifications, create channel, leave), Invite, LFG Board, Shared workspace and the channels by category, each
  with unread, mentions, "N in voice" and the Classic channel menu (copy link, mute, edit, delete).
- The navigator is ≥ 280 px, resizable with the same saved width as Classic's channel column. On phones it is a
  full-height drawer (the menu button in the masthead, swipe, scrim, Escape or Back to close).

## Canvas and Context

- **CallStrip:** while you're in a call, a slim live strip across the top of the canvas (tablet and up): the
  room, connection meter, mute, deafen, mixer and disconnect. Phones keep MobileNavigation's call strip.
- **Masthead:** see the seams table. The Context toggle is on channel pages.
- **Context sheet:** People (the member list), Pinned (the channel's pinned messages, same query as the Pins
  drawer, fetched while the tab shows) and About (channel topic, Space description, rules). "Keep open beside the
  conversation" (≥ 1200 px) pins it as a column, remembered per browser (`diskarte:pulse:context-pinned`).

## Data sources and privacy

- Spaces: `servers` from `getMyServers` (the tambayan layout); RLS returns only Spaces you belong to.
- Rooms, members and voice occupancy: `useServer()`, the bundle `[serverId]/layout.tsx` loaded after its
  `notFound()` membership guard. Private rooms appear only when RLS returned them; occupancy is counted only for
  those rooms, so someone in a room you can't see never shows.
- Conversations and friends: `useSocial()`.
- Pinned messages: a `messages` select, RLS-scoped like every message read.
- The Control Center entry depends only on the server-provided platform role (`AdminAccessProvider`); the page
  re-checks it.
- No `use cache` or `unstable_cache`; nothing is fetched client-side that the Classic UI doesn't already fetch.
- **Pins** are saved in the display preferences (`pins: ["space:<id>", "dm:<id>"]`, at most 20, validated on
  read), which sync through `account_state` under `prefs:display` and fall back to this browser when that table
  is missing. A pin to something you no longer belong to is never shown. The field is absent until you pin
  something, so Classic preferences keep their shape.

## Keyboard

| Keys | Where | Does |
| --- | --- | --- |
| ⌘/Ctrl K | Anywhere | Jump to… (Go anywhere) |
| ⌘/Ctrl ⇧ H, ⌘/Ctrl ⇧ M | Anywhere | Home, Messages |
| ⌘/Ctrl 1–9 | Anywhere (no dialog open) | Open the 1st–9th Space (HQ first, then your order) on its last room |
| ↑ / ↓, Home / End | Navigator lists | Move between rows (rooms included) |
| Escape | Navigator | Back to the canvas (`#main-content`); on phones it closes the drawer |
| ← / → | Home · People · Spaces, Context tabs | Move and select |
| Shift F10, right-click, long-press | Spaces, rooms, conversations | Their menus |

The skip link ("Skip to content") is the first Tab stop and lands on the canvas.

## Tests

- `tests/ui/pulse-shell.test.tsx`: a shell switch keeps the call and ShellProviders mounted, WorkspacePanel's two
  paths, RLS-scoped navigator data (no hidden rooms or their occupants, Control Center only for super admins),
  ⌘/Ctrl 1–9, arrows and Escape, the Context tabs and pin storage.
- `tests/browser/pulse-shell.spec.ts`: axe (WCAG 2.2 AA) in dark and light at 390, 768, 1280 and 1440 px on six
  routes, the phone navigator and the Context sheet; no horizontal overflow; an h1 in `#main-content`; the skip
  link; the pinned Context column. Screenshots: `test-results/pulse-shell-*.png`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-shell
```

## Not yet

- Messages, composer, DM and page bodies keep their Classic look in the canvas (Step 5).
- No Media tab in the Context sheet: recent attachments need a new query (Step 5).
- Phones: the navigator is a drawer and MobileNavigation's tabs stay; the Pulse phone design is Step 6, as is
  the voice redesign (the CallStrip is the Classic dock, re-laid-out).
- Rooms can't be dragged to reorder in Pulse yet (moderators use Classic, or edit the channel).
- Space-level live indicators only show your own call; other Spaces' voice activity needs the voice preview
  data per Space.
