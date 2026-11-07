# Feature catalogue

Every user-facing feature, its status, where it lives and how it is tested. Status is based on the
code in `main` and the release notes, not on plans.

| Status | Meaning |
| --- | --- |
| **Shipped** | Implemented, covered by automated tests, usable once its migration is applied |
| **Needs setup** | Implemented, but only works after optional configuration (env vars, cron, Vault) |
| **Partial** | Works with documented gaps |
| **Not implemented** | Asked for or implied elsewhere, but not in the code |

## Pages

| Page | Covers |
| --- | --- |
| [Messaging](messaging.md) | Text and forum channels, composer, replies, threads, reactions, attachments, voice messages, polls, pins, edits, stickers, GIFs, link previews, slash commands, scheduled messages, search, saved messages, forwarding, unreads |
| [Friends, DMs and profiles](social.md) | Profiles, statuses, friends, privacy, nicknames, notes, favourites, blocking, DMs and group DMs, read receipts, Moments |
| [Tambayans](communities.md) | Servers, channels, ranks and roles, private channels, invites, discovery, templates, rules, welcome messages, announcements, events, levels, emoji, soundboard, support badges, LFG, webhooks |
| [Moderation and administration](moderation.md) | Bantay-Bayan auto-mod, slow mode, verification gates, timeouts, warnings, bans, audit log, voice moderation, problem reports, the Super Admin Control Center |
| [Voice and video](voice-and-video.md) | Joining calls, screen share, devices, push to talk, mixer, activities, rings, previews |
| [Shared workspace](workspace.md) | Notes, task boards, focus timers, resources, whiteboards |
| [Account, settings and app](account-and-settings.md) | Sign-up, MFA, sessions, data export, deletion, appearance, accessibility, language, notifications, PWA, low-data mode |

## Status overview

| Feature | Status | Notes |
| --- | --- | --- |
| Text channels, replies, reactions, attachments, pins, edits | Shipped | |
| Threads and forum channels | Shipped | |
| Voice messages, polls, stickers | Shipped | |
| GIF search | Needs setup | `GIPHY_API_KEY` |
| Link previews | Shipped | Per-instance cache |
| Slash commands | Shipped | Five built-in text transforms; no bot commands |
| Scheduled messages | Shipped / needs setup | Sends while the author is online; needs the platform cron job to send while they're away. Text channels only, not DMs |
| Search (server and global) | Shipped | |
| Unreads, mentions, Mark Unread, Mark all read | Shipped | |
| Friends, blocking, privacy, nicknames, notes, favourites | Shipped | |
| DMs and group DMs (≤ 10), DM media | Shipped | |
| DM read receipts (Sent / Seen) | Partial | No opt-out |
| Custom status with expiry | Shipped | Offline users' statuses clear only with the cron job |
| Moments | Partial | Purged photos stay in Storage until account deletion |
| Tambayans, channels, categories, reordering | Shipped | |
| Ranks, custom roles, private channels | Shipped | |
| Invites (permanent + limited) | Shipped | |
| Discovery (Explore) | Shipped | |
| Templates and settings export | Shipped | |
| Server rules | Shipped | |
| Welcome messages | Shipped | |
| Recurring announcements | Needs setup | Only posted by the platform cron job |
| Events with RSVPs, capacity, weekly series, calendar export | Shipped | Reminders need Web Push |
| Community levels (XP) | Shipped | Off by default |
| Custom emoji, soundboard, support badges, LFG | Shipped | |
| Incoming channel webhooks | Shipped | Incoming only; no outgoing webhooks or bot accounts |
| Automation builder (triggers/conditions/actions) | Not implemented | Welcome messages and recurring announcements only |
| Bot accounts, OAuth apps, interactive slash commands | Not implemented | |
| Auto-mod, slow mode, verification gates, timeouts, warnings, bans, audit log | Shipped | |
| Voice moderation (mute, deafen, disconnect, move) | Shipped | Can't move into private channels |
| Problem reports and Control Center | Shipped | Manual triage; the earlier automated "fix agent" was removed |
| Voice/video calls, screen share, DM calls, rings | Shipped | Not verified on physical phones |
| Live voice previews | Shipped / needs setup | Server-side disconnects need the LiveKit webhook |
| Soundboard, watch party, Tic-Tac-Toe, trivia | Shipped | |
| Recording, transcription, E2E encryption | Not implemented | |
| Shared notes, boards, focus timers, resources, whiteboards | Shipped | |
| Collaborative real-time co-editing (CRDT/OT) | Not implemented | Revision checks with explicit conflict resolution instead |
| MFA (TOTP), sessions, sign out everywhere | Shipped | |
| Data export and account deletion | Shipped | |
| Themes, light/system mode, accessibility settings | Shipped | |
| Filipino language | Partial | Core navigation and settings strings only |
| PWA install, offline fallback, offline outbox | Shipped | Conversations aren't readable offline |
| Web Push | Needs setup | Production configuration and physical-device delivery unverified |
| Native mobile apps | Not implemented | The PWA is the mobile app |
| Help Center (`/docs`) with search and in-app help links | Shipped | Public; documents `main` |

## Feature page format

Each feature section on these pages answers the same questions in this order, so they are quick to
scan and easy to keep current (see the [feature doc template](../contributing/templates/feature.md)):

**What it does · How to use it · Behaviour and limits · Code · Data and permissions · Errors and
recovery · Tests · Known limitations**
