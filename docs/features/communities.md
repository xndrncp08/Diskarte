# Tambayans (communities)

A Tambayan is a server: members, channels in categories, ranks and roles, and community tools.

**Main code:** [`actions/servers.ts`](../../diskarte/src/actions/servers.ts),
[`ServerProvider`](../../diskarte/src/components/providers/ServerProvider.tsx),
[`ChannelSidebar`](../../diskarte/src/components/server/ChannelSidebar.tsx),
[`MemberList`](../../diskarte/src/components/server/MemberList.tsx),
[`ServerSettingsDialog`](../../diskarte/src/components/server/ServerSettingsDialog.tsx) and
[`components/server/settings/`](../../diskarte/src/components/server/settings),
[`lib/servers.ts`](../../diskarte/src/lib/servers.ts), [`lib/data/servers.ts`](../../diskarte/src/lib/data/servers.ts).
**Routes:** `/tambayan/[serverId]/[channelId]`, `/tambayan/[serverId]/lfg`,
`/tambayan/[serverId]/workspace`, `/tambayan/explore`, `/invite/[code]`.

## Creating and joining

| Action | How | Rules |
| --- | --- | --- |
| Create | Server rail → **Add a server** → name, description, template | Templates: Gaming crew, Study group, Creator community, Friend group, Organization / team. Every template has general chat and voice; study/creator/team add resource and discussion channels. You become owner and admin |
| Join by invite | Open `/invite/<code>` or paste a link/code in **Add a server** | Refused when banned (`BANNED`) or already in 100 Tambayans (`SERVER_JOIN_LIMIT`) |
| Join from Explore | `/tambayan/explore` → browse by category or search → Join | Only servers whose admins listed them (`is_public`); same ban and limit checks (`join_public_server`) |
| Leave | Server context menu → Leave | Owners must transfer ownership or delete the server first |
| Transfer / delete | Server settings → Overview (owner) | Deleting removes channels and messages |

Everyone is also a member of **Diskarte HQ**, the system Tambayan (no owner; can't be deleted).

**Discovery categories:** Gaming, Study, Creators, Friends, Music, Tech, Anime, Sports, Other.
Nothing about unlisted servers is ever returned (`discover_servers`).

**Templates and export:** Server settings → Overview (admins) also holds rules, welcome messages
and levels, and can export the server's settings as JSON
(`export_server_settings`).

Tests: `tests/db/invites.test.ts`, `tests/db/discovery.test.ts`, `tests/db/templates.test.ts`,
`tests/db/super-server.test.ts`, `tests/ui/explore-messages.test.tsx`.

## Channels

| Type | Purpose |
| --- | --- |
| Text | Chat; name `a–z 0–9 _ -`, ≤ 32 chars |
| Voice | LiveKit room `voice:<id>`; any name ≤ 32 chars |
| Forum | Titled posts with threads |

Moderators create, edit, reorder (drag or keyboard) and delete channels and set per-channel
**topic**, **category**, **slow mode**, **read-only** (moderators post) and **verified accounts only**.
Only admins make a channel **private** or public again. Channel mutes and "hide muted channels" are
per browser. The last channel you opened in each server is remembered so the rail links straight to it.

## Ranks, roles and permissions

| Rank | Can |
| --- | --- |
| Member | Read and post where allowed, react, join voice, create invites, RSVP, post LFG beacons |
| Moderator | + pin, delete others' messages, slow mode/verification/read-only, kick, ban, timeout, warn members below them, voice moderation, see the audit log, bans and all invites, schedule events, create channels |
| Admin | + server settings (overview, roles, auto-mod, emoji, soundboard, webhooks, announcements, support), change ranks, private channels, levels reset |
| Owner | + demote admins, transfer ownership, delete the server |

Rules are enforced by RLS and guard triggers (see [database.md → Permission model](../database.md#permission-model));
the UI mirrors them with `canManageMember()` only to hide controls you can't use.

**Custom roles** (Server settings → Roles): named, coloured labels (nine readable colours) handed out
from a member's right-click menu. They show as role colours (toggle in Settings → Accessibility) and can be
mentioned by moderators with `@{Role name}`. They grant **no moderation power**; their main use is
**private channel access**: a private channel is visible to admins plus the members and roles it was
opened to (`channel_access`).

Tests: `tests/db/private-channels.test.ts`, `tests/db/ownership.test.ts`, `tests/ui/roles-private.test.tsx`.

## Invites

- Every server has a permanent invite code (admins can regenerate it).
- Any member can create extra links that expire after 30 min, 1 h, 6 h, 12 h, 1 day, 7 days or never,
  with 1, 5, 10, 25, 50, 100 or unlimited uses. Using a limited invite consumes a use (rejoining as a
  member doesn't).
- Moderators see and revoke every invite; members see and revoke their own (Server settings → Invites).
- `/invite/<code>` previews the server (`get_invite`) before joining.

## Membership screening

**What.** Joining questions (up to 5, 200 characters each) and/or moderator approval for new
members. **How.** Server settings → **Membership** (admins set it up; moderators see the queue).
While either is on, joining by invite or from Explore opens a **Before you join** form with the
rules and questions instead of joining straight away.

| Setting | What joining does |
| --- | --- |
| Questions only | Answer them and you join immediately; the answers are kept |
| Approval on | A pending request (`join_requests`) that moderators **Approve** (adds the member) or **Decline** |

- `join_server` raises `SCREENING_REQUIRED`; the form reads `join_screening(code | server)`, which
  only returns the name, rules, questions and your own request status — and only for a live invite
  code or a server listed in Explore.
- `request_to_join` validates one 1–500 character answer per question (`INVALID_ANSWERS`), counts a
  limited invite's use, caps you at 10 pending requests, and makes a declined applicant wait a day
  (`JOIN_REQUEST_REJECTED`).
- `decide_join_request` is moderators-only, refuses banned users and writes `member.approve` /
  `member.reject` to the audit log. Moderators watch the queue live on `db:join-requests:<server>`
  and get a "N people want to join" nudge in the channel sidebar.
- Applicants see only their own requests; other members never see applications. Answers are in
  the applicant's data export.

Code: [`JoinScreening.tsx`](../../diskarte/src/components/server/JoinScreening.tsx). Migration
`20261108010000_membership_screening.sql`. Tests: `tests/db/membership-screening.test.ts`,
`tests/ui/join-screening.test.tsx`.

## Server rules

Admins write rules (Server settings → Overview). Members must accept the current rules before
posting; editing the rules asks everyone again (`rules_updated_at`). Moderators and up are exempt.
[`RulesGate`](../../diskarte/src/components/server/RulesGate.tsx) shows a card instead of the
composer until accepted; the database refuses posts with `RULES_NOT_ACCEPTED`.
Tests: `tests/db/server-rules.test.ts`, `tests/ui/rules-gate.test.tsx`.

## Welcome messages

Admins pick a text channel and a template; when someone joins, Diskarte posts it there as
"Welcome" (like a webhook post), replacing `{user}` with `@username` and `{server}` with the server
name. A failed post never blocks the join. Tests: `tests/db/welcome-messages.test.ts`.

## Recurring announcements

Server settings → Announcements: post a message in a text channel every day, or weekly on one
weekday, at a local time in the admin's time zone (up to 10 per server). The minute platform job
posts due ones as "Announcement" and shows the last run or error in the list. **Requires the
platform cron job** ([background jobs](../architecture/background-jobs.md)).
Tests: `tests/db/recurring-announcements.test.ts`, `tests/ui/server-automation-settings.test.tsx`.

## Events

**What.** Scheduled events in a voice channel or elsewhere, with Interested RSVPs.
**How.** Sidebar **Events** row (shows a count or LIVE) → browse, RSVP, or (moderators) schedule.
**Behaviour.**

- Optional capacity 1–10,000; RSVP counts update atomically on the event row, so events can't be
  overbooked; `list_server_events` returns canonical counts and your own RSVP.
- **Repeat:** one event or a weekly series of 4, 8 or 12 separate occurrences (created in your
  device's time zone; edit or cancel each one afterwards).
- Moderators edit with concurrent-change detection and confirm cancellation.
- Add to calendar: RFC 5545 `.ics` export with UTC times.
- Events in a private channel (and their attendee lists) are only visible to people who can see that
  channel.
- An event without an end time counts as over 4 hours after it starts.
- With Web Push configured, people who are Interested get a reminder 15 minutes before.

Tests: `tests/db/events.test.ts`, `tests/db/event-capacity.test.ts`, `tests/ui/events.test.tsx`,
`src/lib/__tests__/events.test.ts`, `e2e/events.spec.ts`.

## Community levels

Off by default; admins enable them per Tambayan. Members earn 15 XP per message at most once a
minute; level = ⌊√(XP / 50)⌋. A sidebar Leaderboard shows the top members; levels appear on member
profiles. Turning levels off hides them and stops earning but keeps XP; admins can reset XP for a new
season (`reset_server_xp`). Tests: `tests/db/community-levels.test.ts`, `tests/ui/levels.test.tsx`.

## Custom emoji

Admins upload up to 50 PNG/GIF/WebP images (≤ 256 KB) with a
`:name:` usable in messages and reactions in that server (public `emoji` bucket).
Tests: `tests/db/emoji.test.ts`, `tests/ui/emoji.test.tsx`.

## Soundboard

12 built-in synthesized 8-bit clips plus up to 24 uploaded MP3s per server (≤ 1 MB, checked for MP3
magic bytes, played for at most 6 s). Played to everyone in the call over the LiveKit data channel;
one clip per person every 2 s; anyone can mute the soundboard for themselves.

## Support and badges

Server settings → Support: GCash/Maya numbers and a thank-you note shown in the **Support this
server** dialog. Admins grant **Server Booster**, **Lodi Supporter** and **GCash Contributor** badges,
shown in the member list and on profile cards. Boost levels unlock at 2, 7 and 14 boosters (cosmetic
only). Diskarte doesn't process payments.

## LFG board

`/tambayan/[serverId]/lfg`: post a beacon (game, party size, voice channel, expiry). **Join Party**
adds you (row-locked capacity check in `join_lfg`) and drops you into the voice channel. Beacons
update live over `db:lfg:<server>`.

## Incoming webhooks

Server settings → Webhooks (admins): create a secret URL for a text channel; any HTTP client can
post plain messages with `{"content": "…", "username": "…"}`. The token is shown once and stored
hashed; rotate it if it leaks. Webhook posts can't ping `@everyone`/`@here`, are limited to 30 per
minute per webhook; creating and rotating webhooks is audited. Full API: [reference/api.md](../reference/api.md#post-apiwebhooksidtoken).
Tests: `tests/db/channel-webhooks.test.ts`, `src/app/api/webhooks/[id]/[token]/__tests__/`.

## Suggestion boards

A forum channel can be switched to a **suggestion board** (forum ⚙ → Forum settings, moderators):
members post ideas and upvote them (one vote each; 30 votes a minute), and moderators set a
status — Under consideration, Planned, In progress, Completed or Declined. Filter by status or
tag and sort by **Top**. See [Forum channels](messaging.md#forum-channels) for tags and Solved posts.

## Known limitations

- No outgoing webhooks, bot users, slash-command apps or a general automation builder.
- Custom roles carry no permissions other than private-channel access.
- No server folders, vanity URLs or member screening questions.
- Badges and boosts are cosmetic; payments happen outside Diskarte.
