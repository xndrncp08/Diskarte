# Pulse on phones

Step 6b of Diskarte Pulse: phone navigation that is designed for a phone rather than a shrunk desktop. It sits in the
[Pulse shell](pulse-shell.md) and is built from the [Pulse components](pulse-components.md). Pulse is still a
super-admin preview; Classic's phone layout (its `MobileNavigation`, colours and drawer) is unchanged.

"Phone" means below `md` (768 px). A phone in landscape (for example 844 × 390) is wider than that and gets the
tablet layout: the navigator column, no tab bar.

## Screens and tabs

[`MobileTabs.tsx`](../../diskarte/src/components/pulse/shell/MobileTabs.tsx) holds the route rules and the bottom area.
The **BottomTabBar** (a `<nav>` of links labelled "Main destinations", not ARIA tabs) has four destinations:

| Tab | Route | Also current on |
| --- | --- | --- |
| Home | `/tambayan` | Search, Control Center |
| People | `/tambayan/messages` (the [Pulse inbox](pulse-communities.md#messages-a-focused-inbox)) | Friends |
| Spaces | `/tambayan/spaces` (new) | Explore, a Space's landing (`/tambayan/[serverId]`) |
| You | `/tambayan/you` (new) | — |

- `phoneTab(pathname)` says which tab a screen belongs to, or `null` for a **conversation**: a DM, a room, or a
  Space's inner pages (workspace, LFG board). Conversations get the whole screen and no tab bar, so the keyboard
  has room.
- **People** is the inbox plus, on phones, a Friends row at the top (with the request count) and **Start a Hangout** /
  **Group** pinned at the bottom in thumb reach (`PeopleActions`, shared with the navigator's People view).
- **Spaces** ([`views/Spaces.tsx`](../../diskarte/src/components/pulse/views/Spaces.tsx)) lists your Spaces in the saved
  order (`useSpaces`, `SpaceRow`, the navigator's rows). A tap opens the Space's landing, where its rooms are;
  long-press opens the Space menu. Explore Spaces, then **Add a Space** at the bottom.
- **You** ([`views/You.tsx`](../../diskarte/src/components/pulse/views/You.tsx)) shows your face and status, the
  status and custom status choices (`useStatusMenu`, pressed toggles under an h2 per group), Notification settings,
  then Settings, the Control Center (super admins) and Back to Classic (`useYouItems`, shared with the You menu). The
  notification hub is in its masthead.
- The two new routes need no new data: Spaces reads `getMyServers` like Messages; You reads the profile already in
  `MeProvider`. Both check `previewShell` on the server and send Classic to `/tambayan`. Every route still opens
  directly (deep links).
- The phone navigator drawer stays: the masthead's menu button on top-level screens, a swipe from the left edge,
  and a landing's "All N rooms". Its Home · People · Spaces switch is unchanged.

## Conversations, Back and gestures

- The Masthead shows **Back** instead of the menu button in a conversation. `backTarget(pathname)`: a DM goes to
  People, anything inside a Space to its landing. `useBack()` returns through history when you came from that
  screen (so the list keeps its scroll) and otherwise pushes it (a deep link has no history to go back to).
- A **swipe from the left edge** goes Back in a conversation (the same `useSwipeDrawer` gesture that opens the drawer
  on top-level screens).
- A conversation opened from a top-level screen **slides in from the right**: the canvas gets `data-enter` and
  `max-md:pulse-motion:data-enter:animate-pulse-enter` (260 ms, no fill mode, so no transform lingers). Under reduced
  motion (OS or Settings) it simply appears.
- **Focus:** after a navigation on a phone, focus moves to the new screen's h1 (made focusable with `tabIndex=-1`),
  else the canvas, so screen readers start on the new screen. Desktop keeps focus where it was.

## Sheets

- **Long-press** on a Space, room or conversation opens its menu in a bottom **Sheet** on touch screens
  (`pointer: coarse`). The shared `ContextMenu` reads `TouchMenuContext`; `PulseMenuSkin` provides a Sheet, Classic
  provides nothing and keeps its floating menu. The click that follows lifting the finger is dropped, so it can't
  close the sheet or pick a row. Messages already did this (Step 5a).
- The **Context** panel is a bottom Sheet on phones. Sheets close with Escape, the scrim, Close or Back.

## Calls, keyboard and safe areas

- During a call the live **CallStrip** sits above the tab bar, and at the bottom of a conversation. Until the voice
  step's `compact` variant lands, the default strip is un-hidden on phones (marked `shortcut:` in the code).
- **Keyboard:** `useKeyboardUp()` follows `useAppViewport`'s `<html data-keyboard>`; while the keyboard is up the
  tab bar and call strip are not rendered and the composer or search field stays in view. Inputs are 16 px on
  phones (no iOS zoom).
- **Safe areas:** the shell pads for the status bar (phones) and, in Pulse at every width, the left and right
  insets (landscape notch). The tab bar pads for the home indicator; with no tab bar, a spacer does. The shell is
  plain `h-dvh` with no measured heights outside the keyboard, so an installed app (standalone) has no bottom gap.
- Touch targets are real 44 px boxes: the tab bar, masthead buttons, rows, and the SegmentedControl's segments
  (now at least 44 px wide on touch). Pulse's Pinned messages button in a room is a Pulse `IconButton`.

## Tests

- `tests/ui/pulse-mobile.test.tsx`: the tab and Back rules, the four tabs with the current one and the unread count,
  no tabs in a conversation, Back by history and by deep link, the edge swipe (Back in a conversation, the drawer
  elsewhere), focus on the new h1 and the slide attribute, the keyboard hiding the tabs, the call strip above the
  tabs, the Spaces and You screens, and context menus as a sheet on touch (floating with a mouse).
- `tests/browser/pulse-mobile.spec.ts` (Chromium with touch emulation, not real devices): seven screens at
  320 × 640, 375 × 812, 390 × 844, 430 × 932 and 844 × 390 in dark and light: tabs only on top-level screens, axe
  (WCAG 2.2 AA) with no violations, no horizontal overflow, and a 44 px probe of the masthead, tab bar and the
  People, Spaces and You pages. Flows: tabs, a DM and Back, Spaces to a landing, a room and an edge swipe back, a deep
  link's Back; the long-press Space sheet and the Context sheet with Escape; safe-area insets emulated through CDP
  (`Emulation.setSafeAreaInsetsOverride`, skipped when the Chromium build lacks it). Screenshots:
  `test-results/pulse-mobile-*.png`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-mobile
```

## Not yet

- Real-device checks (iOS Safari, Android Chrome, installed PWA): everything above is browser emulation.
- Swipe-to-dismiss on sheets, and an interactive (finger-following) Back swipe; the swipe triggers after 56 px.
- The compact call strip (voice step) and the voice room's phone layout.
- Room and DM pages inside a conversation have no quick switcher besides Back; the drawer is one tap away from
  the landing.
