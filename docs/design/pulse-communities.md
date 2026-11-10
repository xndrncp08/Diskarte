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

- **Header:** the Masthead (the Space name as the h1, member and online counts), then a hero card: the banner, or
  the accent band with the name, then the icon, the description and **Open #room** (the page's one primary action).
- **Bento tiles:** Rooms (live voice rooms first, then every room with unread and mentions; the navigator's rows
  and right-click menus), Coming up (the next three events), Start here (welcome message, rules, a link to the
  welcome room), People (faces, online count, custom roles, **See everyone** opens the Context sheet), Shared
  workspace, Boards (LFG, forums and suggestion boards), Invite (not in Diskarte HQ) and, for moderators with
  approval on, Join requests (opens Server settings → Membership).
- **Who sees what:** `landingTiles()` ([`lib/community-identity.ts`](../../diskarte/src/lib/community-identity.ts))
  gates tiles by role. Rooms, members and roles come from `useServer()` (the RLS-scoped bundle), events from a
  `server_events` select on the page (RLS-scoped), the join-request count from `useJoinRequestCount()` (RLS shows it
  to moderators only). No `use cache`.

### Banner and accent

The `banner_url` and `accent_color` columns come from migration `20261109010000` (branch `feat/community-identity`,
not merged yet). They are optional in `database.types.ts` and read as `server.banner_url ?? null`, so the landing and
Explore work with or without the migration (no banner, no accent).

- **Banner allow-list:** `communityBanner(url, supabaseUrl)` returns the URL only when it is a public object in this
  project's avatars bucket (`<SUPABASE_URL>/storage/v1/object/public/avatars/…`, same scheme and host, no `..`, no
  credentials). Anything else is ignored, because an arbitrary https host could log who views the page. The image
  is decorative (`alt=""`, `referrerPolicy="no-referrer"`).
- **Accent on-colour:** `communityAccent(hex)` returns the accent with white text when white reaches 4.5:1 on it,
  otherwise `#121016`: the rule the migration's check constraint enforces. Malformed values are ignored.
- No banner upload UI yet; it belongs in Server settings next to the icon (`uploadPublicImage(…, "banner", …)` →
  `servers/<id>/banner-<uuid>.(jpg|png|webp)`), admin-only, once the migration ships.

## Explore (`/tambayan/explore`)

[`PulseExplore`](../../diskarte/src/components/pulse/views/Explore.tsx): Masthead, an editorial "Find your tambayan"
headline, the search field and categories as a SegmentedControl, then communities as cards (the first one featured
two columns wide when there are three or more), each with its banner or accent stripe when set. `ExploreView` keeps
the `discover_servers` query, paging, retry and the join flow, membership screening dialog included, so both shells
behave the same. Non-members see only what `discover_servers` returns.

## Home (`/tambayan`)

[`PulseHome`](../../diskarte/src/components/pulse/views/Home.tsx) gets everything HomeView already computes and
lays it out as "Where should I go next?": What's new and Getting started (the shared components, restyled by
`[data-pulse-home]` rules in `pulse.css`), Moments, then tiles for conversations, mentions and friend requests,
friends around with **Start a Hangout** (the page's one primary action), live voice rooms (the same voice preview),
events, your Spaces (to their landings) and create / join / add friends. Same dialogs as Classic, no feed.

## Messages: a focused inbox

The navigator's People view already lists every conversation, so in Pulse `/tambayan/messages` is an **inbox**
([`PulseInbox`](../../diskarte/src/components/pulse/views/Inbox.tsx)) rather than a second copy: the Masthead with
the unread count, a search field, **All / Unread (n)**, and roomier rows (avatar, name, when it last moved, hangout
timer, unread dot). Friends and new group DMs stay in the navigator. The filtering is MessagesView's, unchanged.

## Page headers

Friends, Shared workspace, Search and the Control Center render the Masthead in Pulse (eyebrow, display-size
title, icon, description; the phone navigator button comes with it). Their Classic headers are untouched. The
Control Center keeps its own section header and tabs below the Masthead.

## Tests

- `tests/ui/pulse-communities.test.tsx`: accent on-colour (including the 4.5:1 boundary), the banner allow-list
  (other hosts, look-alike hosts, other buckets, `..`, http), tile gating by role, the landing for members and
  moderators, the banner rendered only from the bucket, and the landing without the identity columns.
- `tests/browser/pulse-communities.spec.ts`: the landing, Explore, Home, Messages and Friends in dark and light at
  390 and 1280 px: axe (WCAG 2.2 AA) with no violations, no horizontal overflow, the Masthead h1; the inbox filter
  and the Explore categories. Screenshots: `test-results/pulse-communities-*.png`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-communities
```

## Not yet

- Banner upload and accent picker in Server settings (needs the migration).
- The Rooms tile shows every room in a scrolling list; very large Spaces may want a "show more".
- Moments, Friends tabs and the Workspace and Control Center bodies keep their Classic look under the bridge.
