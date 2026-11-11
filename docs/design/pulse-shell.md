# Pulse shell

The application frame of Diskarte Pulse, direction "Canvas": a **Spaces navigator** on the left, the
**Conversation Canvas** (a masthead over the page) and a **Context sheet** opened on demand. There is no server
rail, no circle-to-squircle icon, no unread pill at the left edge and no user panel in the bottom-left corner.
Built from the [Pulse components](pulse-components.md); the decision is
[ADR 017](../architecture/decisions.md#017-one-frame-mount-shell-aware-seams).

## Turning it on and off

- The `diskarte-shell` cookie picks the shell: `pulse`, or anything else (absent, `classic`, tampered) for Classic.
  Classic is the default and renders exactly as before.
- **Server gate:** `resolveShell(cookie, platformRole, publicOptIn)`
  ([`lib/shell.ts`](../../diskarte/src/lib/shell.ts)) is used by the tambayan layout and by the root layout's
  `data-shell`. Public opt-in requires `DISKARTE_PULSE_ROLLOUT=opt-in`; without it only super admins can use the
  preview, and a member who sets the cookie by hand still gets Classic. Missing or invalid cookies always select
  Classic. The cookie chooses presentation; data requests retain their authorization checks.
- Eligible users switch in **Settings → Appearance → Try the new Diskarte**. The server supplies rollout
  availability; the browser does not decide it. See the [rollout gate](pulse-rollout.md).
- Pulse's "You" menu has **Back to Classic**.
- Switching calls `setShell` ([`lib/shell.ts`](../../diskarte/src/lib/shell.ts)): it flips `<html data-shell>`,
  writes the cookie and runs `router.refresh()`. No reload, so a call stays connected.
- **Rollback:** clear the cookie (or set it to `classic`). Nothing is stored server-side.

## Architecture

```text
app/(app)/layout.tsx           AdminAccessProvider (platform role) → SessionProviders (call, presence, social…)
└─ app/(app)/tambayan/layout   reads the cookie
   └─ ShellProviders           admin access, ShellKind, layout, unreads, ShellUI, watchers, ConfirmHost
      └─ AppFrame              one persistent frame; Pulse UI and skin providers stay mounted
         ├─ navigation         Classic rail, or Pulse Navigator and resize handle
         └─ content column     BroadcastBanner, Pulse CallStrip, persistent page slot, shell's phone navigation
```

`AppFrame` (exported from `pulse/shell/PulseShell.tsx`) stays mounted when the shell changes. `ClassicFrame` and
`PulseShell` remain wrappers for standalone uses; the app layout renders `AppFrame` directly. Pulse's UI, menu
and tooltip providers stay mounted, with the skins active only in Pulse. The main page and its content slot also
retain their identity. This preserves pending uploads and local conversation state as well as the call (in
`SessionProviders`), unreads and membership/DM/reminder watchers. Swapping frame component types would remount the
page and run Composer's upload cleanup, so retaining only the session providers is insufficient.

Inline message edit text belongs to `MessageItem` rather than the shell-specific edit box, so changing the
transcript markup does not reset an unsaved edit. Switching tests cover input node identity, local conversation
state, pending uploads, inline edits and the existing call/watchers contract.

### Seams

Pages were not rewritten. The components they already use read `useShellKind()`
([`ShellKind.tsx`](../../diskarte/src/components/shell/ShellKind.tsx)) and take a Pulse path:

| Seam | Classic | Pulse |
| --- | --- | --- |
| `WorkspacePanel id="nav"` (HomeSidebar, ChannelSidebar) | Resizable column / phone drawer | Renders nothing: the navigator owns navigation |
| `WorkspacePanel id="main"` | `<main id="main-content">` column | The canvas: the same landmark on a Pulse surface card |
| `ChannelHeader`, `PageHeader` | `.page-header` | `Masthead`: the page's one h1 in Bricolage (display size from tablets up), the Space name, topic and member count, the page's actions (a Pulse search field), the Context toggle. The channel welcome under it shrinks to a small heading |
| ChatView's Pinned messages button | Pins drawer | Opens Context on the Pinned tab |
| `RosterDrawer` | Member column | `ContextPanel`: a Sheet, or a column when pinned at ≥ 1200 px |
| `MemberList` | Everyone, offline dimmed | 100 rows at a time with "Show more", offline at full contrast |
| `[serverId]/layout.tsx` | — | Renders `<PulseRooms>`, portalled into the navigator under the open Space |
| Classic tooltips and menus | Classic look | Pulse look (`PulseTooltipSkin`, `PulseMenuSkin`) |

Shared logic was lifted out of Classic components rather than copied: `useServerControls` and
`useChannelMenuItems` (ChannelSidebar), `useStatusMenu` (UserPanel), `useGoAnywhere` (WorkspaceControls),
`useServerBadge`, `useServerHref`, the saved Space order (ServerRail), `usePinnedMessages` (PinsDrawer),
`useNavDrawer` (the phone drawer's focus and Escape handling).

### The Classic bridge

Shared pages and overlays still read Classic tokens (`--color-midnight`,
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
  count, unread dot, "In call" while you're in its voice room and the Classic server menu (plus Pin) on
  right-click. The open Space's row gets a "…" button (Classic's server menu: invite, settings, Bantay-Bayan,
  notifications, create channel, leave) and Invite, and the Space expands to its **rooms** as plain rows (no tree
  lines, no # icons): Overview (the Space's [landing page](pulse-communities.md)), LFG Board, Shared workspace,
  **Live** (voice rooms with people in them, "N in voice"), then the rest. The default "Text Channels"/"Voice Channels" labels are hidden; custom categories keep theirs. Each
  room shows unread and mentions and has the Classic channel menu (copy link, mute, edit, delete).
- The navigator is ≥ 280 px, resizable with the same saved width as Classic's channel column. On phones it is a
  full-height drawer (the menu button in the masthead, swipe, scrim, Escape or Back to close) that opens with
  focus on the current room or page.

## Canvas and Context

- **CallStrip:** while you're in a call and not on its stage, the live strip across the top of the canvas (tablet and
  up; a `compact` variant for phones). See [Pulse voice](pulse-voice.md).
- **Masthead:** see the seams table. The Context toggle is on channel pages.
- **Context sheet:** People (the member list), Pinned (the channel's pinned messages, same query as the Pins
  drawer, fetched while the tab shows) and About (channel topic, Space description, rules). "Keep open beside the
  conversation" (≥ 1200 px) pins it as a column, remembered per browser (`diskarte:pulse:context-pinned`); in the
  column, Unpin turns it back into the open sheet and Close puts it away. The Pinned tab is keyed by channel, so
  another channel's pins never show while loading.

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
| Alt (Option) 1–9 | Anywhere but a text field, no dialog open | Open the 1st–9th Space (HQ first, then your order) on its last room. Not ⌘/Ctrl: browsers keep those for tabs. Matched on the key position (`Digit1`…), since Option + digit types a symbol on macOS. Listed in Settings → Keybinds when Pulse is available |
| ↑ / ↓, Home / End | Navigator lists | Move between rows and their buttons (rooms included) |
| Escape | Navigator | Back to the canvas (`#main-content`); on phones it closes the drawer |
| ← / → | Home · People · Spaces, Context tabs | Move and select |
| Shift F10, right-click, long-press | Spaces, rooms, conversations | Their menus |

The skip link ("Skip to content") is the first Tab stop and lands on the canvas, which then shows a focus outline
(keyboard focus only, in both shells). Tooltips open on hover and keyboard focus, not when a tap focuses a button.

## Tests

- `tests/ui/pulse-shell.test.tsx`: shell-switch preservation, WorkspacePanel's two
  paths, RLS-scoped navigator data (no hidden rooms or their occupants, Control Center only for super admins),
  Alt 1–9 (and not Ctrl/⌘ or while typing), arrows and Escape, the Context tabs, `openContext("pinned")`, the
  You menu rejoining presence after Invisible, and pin storage. `tests/ui/pulse-gate.test.tsx` and
  `tests/ui/pulse-opt-in.test.tsx`: server rollout eligibility, Classic by default and the public switch.
- `tests/browser/pulse-shell.spec.ts`: axe (WCAG 2.2 AA) in dark and light at 390, 768, 1280 and 1440 px on six
  routes, the phone navigator and the Context sheet; no horizontal overflow; an h1 in `#main-content`; the skip
  link; the pinned Context column. Screenshots: `test-results/pulse-shell-*.png`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-shell
```

## Not yet

- Messages, the composer, DMs, threads and forums have their Pulse look: see [Pulse messaging](pulse-messaging.md).
- Messages, Friends, Shared workspace, Search, the Control Center, Home, Explore, the Space landing and the DM page
  use the Masthead: see [Pulse communities and pages](pulse-communities.md). Other page bodies (Moments, the Workspace
  body, the Control Center body) keep their Classic look in the canvas.
- No Media tab in the Context sheet: recent attachments need a new query (Step 5).
- Phones and voice have their Pulse paths: see [Pulse on phones](pulse-mobile.md) and [Pulse voice](pulse-voice.md).
- Rooms can't be dragged to reorder in Pulse yet (moderators use Classic, or edit the channel).
- Space-level live indicators only show your own call; other Spaces' voice activity needs the voice preview
  data per Space.
