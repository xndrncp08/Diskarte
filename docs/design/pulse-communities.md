# Pulse communities and pages

Step 5b of Diskarte Pulse: a Space's landing page, Explore, Home, the Messages inbox and the page headers. Built from
the [Pulse components](pulse-components.md) inside the [Pulse shell](pulse-shell.md). Pulse is a super-admin preview
(the server gate in `previewShell`); Classic renders exactly as before. Every page shares its data and logic with
Classic and takes its Pulse path through `useShellKind()`.

## Community landing (`/tambayan/[serverId]`)

Classic still redirects the Space's index to its first text room. In Pulse the index page (after the layout's
`notFound()` membership guard) renders [`CommunityLanding`](../../diskarte/src/components/pulse/community/CommunityLanding.tsx).
A link with `?event=<id>` still goes to the first room, where the event opens. The navigator's Space row keeps
opening the last room; the new **Overview** row at the top of the Space's rooms opens the landing.

- **Header:** the Masthead (the Space name as the h1, member and online counts), then a cover-style hero: the
  banner or a plain accent band (decorative, no text), the icon overlapping it, the description, the category and
  **Open #room** (the page's one primary action, full width on phones).
- **Bento tiles:** Rooms (six at most: live voice rooms, then rooms with unread or mentions, then the rest; the
  navigator's rows and right-click menus; **All N rooms** opens the navigator drawer on phones and moves focus to the
  Space's rooms on desktop. Private rooms' occupancy is on their own topic, so they rank as quiet here), Coming up
  (the next three events, relative times), Start here (welcome message, rules, a link to the
  welcome room), People (faces, online count, custom roles, **See everyone** opens the Context sheet), Shared
  workspace, Boards (LFG, forums and suggestion boards), Invite (not in Diskarte HQ) and, for moderators with
  approval on, Join requests (opens Server settings → Membership).
- **Who sees what:** `landingTiles()` ([`lib/community-identity.ts`](../../diskarte/src/lib/community-identity.ts))
  gates tiles by role. Rooms, members and roles come from `useServer()` (the RLS-scoped bundle), events from a
  `server_events` select on the page (RLS-scoped), the join-request count from `useJoinRequestCount()`, which only
  queries (and only listens for focus) for moderators of a Space with approval on. No `use cache`.

### Banner and accent

The `banner_url` and `accent_color` columns come from migration `20261109010000` (branch `feat/community-identity`,
not merged yet). They are optional in `database.types.ts` and read as `server.banner_url ?? null`, so the landing and
Explore work with or without the migration (no banner, no accent).

- **Banner allow-list:** `communityBanner(url, supabaseUrl)` returns the URL only when it is a public object in this
  project's avatars bucket (`<SUPABASE_URL>/storage/v1/object/public/avatars/…`, same scheme and host, no
  credentials, a path of plain characters only: no `..`, `%2e`, `%2f`, `%5c` or any other percent-encoding, so no
  encoded or double-encoded variant can leave the bucket). Anything else is ignored, because an arbitrary https host could log who views the page. The image
  is decorative (`alt=""`, `referrerPolicy="no-referrer"`).
- **Accent on-colour:** `communityAccent(hex)` returns the accent with whichever of white and `#121016` contrasts
  more (the migration's check constraint guarantees one reaches 4.5:1). Nothing puts text on the accent today (the
  band and Explore's stripe are decorative); the on-colour is for the coming picker. Malformed values are ignored.
- No banner upload UI yet; it belongs in Server settings next to the icon (`uploadPublicImage(…, "banner", …)` →
  `servers/<id>/banner-<uuid>.(jpg|png|webp)`), admin-only, once the migration ships.

## Explore (`/tambayan/explore`)

[`PulseExplore`](../../diskarte/src/components/pulse/views/Explore.tsx): Masthead, an editorial "Find your tambayan"
headline (tablets and up; phones go straight to search), the search field, the categories on their own row as
single-select toggle chips (`aria-pressed`) that wrap so none is cut off, then communities as cards (the first one featured
two columns wide when there are three or more), each with its banner or accent stripe when set. `ExploreView` keeps
the `discover_servers` query, paging, retry and the join flow, membership screening dialog included, so both shells
behave the same. Non-members see only what `discover_servers` returns.

## Home (`/tambayan`)

[`PulseHome`](../../diskarte/src/components/pulse/views/Home.tsx) gets everything HomeView already computes and
lays it out as "Where should I go next?" (the first h2, above the fold on phones): tiles for conversations,
mentions and friend requests, friends around with **Start a Hangout** (the page's one primary action), live voice
rooms (the same voice preview), events, your Spaces (to their landings) and create / join / add friends. Getting
started (the shared component, restyled by `[data-pulse-home]` rules in `pulse.css`) sits above the tiles only for
new accounts, otherwise after them with What's new and Moments. Times are relative ("5 min. ago", "in 2 days", via
`RelativeTime`). Same dialogs as Classic, no feed.

## Messages: a focused inbox

The navigator's People view already lists every conversation, so in Pulse `/tambayan/messages` is an **inbox**
([`PulseInbox`](../../diskarte/src/components/pulse/views/Inbox.tsx)) rather than a second copy: the Masthead with
the unread count, a search field, **All / Unread (n)**, and roomier rows (avatar, name, when it last moved, hangout
timer, unread dot). Conversations carry no last-message text, so rows show when they last moved (relative) rather
than a preview; a preview needs a new query. Friends and new group DMs stay in the navigator. The filtering is MessagesView's, unchanged.

## Page headers

Friends, Shared workspace, Search and the Control Center render the Masthead in Pulse (eyebrow, display-size
title, icon, description; the phone navigator button comes with it). Their Classic headers are untouched.

- **Friends:** the tabs take the Pulse look (tint plus sun underline when selected, accent count on Pending, Add
  Friend as the gold action until chosen); same tablist and keys.
- **Control Center:** `AdminControlCenter pulse` renders the Masthead itself, with Live/Polling (a StatusBadge) and
  Refresh (an IconButton, 44 px on touch) as its actions and "Updated …" as the description, instead of its own
  icon and h2.

## Tests

- `tests/ui/pulse-communities.test.tsx`: accent on-colour (higher contrast wins, at the crossover), the banner
  allow-list (other hosts, look-alike hosts, other buckets, `..`, `%2e`, `%2f`, `%5c`, double encoding, http),
  tile gating by role, only moderators querying join requests, the six-room Rooms tile with All rooms, relative
  times, the banner rendered only from the bucket, and the landing without the identity columns.
- `tests/browser/pulse-communities.spec.ts`: the landing, Explore, Home, Messages and Friends in dark and light at
  390 and 1280 px: axe (WCAG 2.2 AA) with no violations, no horizontal overflow, the Masthead h1; the inbox filter
  and the Explore categories. Screenshots: `test-results/pulse-communities-*.png`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-communities
```

## Not yet

- Banner upload and accent picker in Server settings (needs the migration).
- A last-message preview in the inbox (needs the conversations query to return it).
- Moments and the Friends, Workspace and Control Center bodies keep their Classic look under the bridge.
