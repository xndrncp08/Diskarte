# Introduction

> **Tara, Tambay Tayo. Ang Bagong Istambayan ng Bayan.**
> ("Come on, let's hang out. The nation's new hangout spot.")

Diskarte is an open-source, self-hostable community platform — text chat, voice, video and screen
sharing — made for Filipino gamers, student organisations, creators and barkadas. It can run entirely
on free tiers of Vercel (or Render), Supabase and LiveKit.

*Diskarte* is Filipino for resourcefulness: finding a clever way to get things done with what you
have. The product leans into that — low-data mode for prepaid connections, an offline outbox for
patchy signal, an installable app instead of app-store downloads, and a deployment that costs ₱0.

## What you can do

| Area | Highlights |
| --- | --- |
| **Tambayans** (communities) | Text, voice and forum channels in categories; invite links with expiry/use limits; public discovery; templates; rules members accept before posting; welcome messages; recurring announcements; events with RSVPs and capacity; optional levels |
| **Messaging** | Markdown with code highlighting, replies, threads, reactions (Pinoy glyph set + custom server emoji), attachments, voice messages, polls, pins, edits with history, stickers, GIFs, link previews, scheduled messages, slash commands, saved messages, forwarding, search |
| **Friends and DMs** | Friend requests with privacy controls, favourites, nicknames, private notes, blocking, 1:1 and group DMs (up to 10) with calls and Sent/Seen receipts, 24-hour Moments |
| **Voice and video** | LiveKit rooms with adaptive grid, screen share with focus mode, noise suppression and input profiles, push to talk, per-person volume, soundboard, watch parties and mini-games, ringing for DM calls |
| **Shared workspace** | Channel-scoped Markdown notes, task boards, focus timers, resource lists and whiteboards with conflict detection |
| **Moderation** | Bantay-Bayan auto-mod, slow mode, verification-only channels, timeouts, warnings, bans, an audit log, voice moderation, server roles and private channels |
| **Platform** | A Super Admin Control Center: network roster and presence inspector, live voice rooms, broadcasts to every user, problem reports, traffic |
| **Everywhere** | Installable PWA, Web Push (opt-in), themes and light mode, Filipino navigation strings, accessibility settings, keyboard navigation |

Feature-by-feature detail, including what is partial or experimental, is in the
[feature catalogue](../features/README.md).

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Tambayan** | A community server (from *tambay*, to hang out). Routes live under `/tambayan` |
| **Diskarte HQ** | The system Tambayan every account joins automatically; hosts `#announcements` and `#global-lounge` |
| **Bantay-Bayan** | The moderation toolkit ("community watch"): auto-mod, bans, audit log |
| **Salakot** | The mascot's hat; the default avatars are recoloured salakot mascots |
| **LFG** | "Looking for group" beacons that drop party members straight into a voice channel |
| **Moments** | 24-hour text/photo updates shown to friends |
| **Control Center** | The super-admin panel at `/admin` |
| **Rank** | A member's built-in role in a Tambayan: Member, Moderator or Admin (plus the owner) |
| **Role** | A custom, coloured label admins create; can grant access to private channels |

## Design principles

1. **The database is the security boundary.** Row Level Security, guard triggers and checked RPCs
   enforce every rule, so no client path can skip them. See [architecture](../architecture/overview.md).
2. **Honest interfaces.** Features that need an unapplied migration or missing configuration say so
   instead of failing silently; sample content on the landing page is labelled as such.
3. **Built for real connections.** Optimistic sends with idempotent retries, an offline queue,
   reconnect recovery, low-data mode and a 30-second call rejoin.
4. **Accessible by default.** Keyboard operation, visible focus, reduced motion and transparency,
   high contrast and axe audits in the test suite.
5. **No AI features.** Diskarte has no generative or automated-moderation AI; reports are triaged
   by people.

## Where to go next

- **Run it locally** → [Quick start](quick-start.md)
- **Understand the system** → [Architecture overview](../architecture/overview.md)
- **Use it** → [User guide](../user-guide/README.md)
- **Deploy it** → [Deployment and operations](../operations/deployment.md)
- **Contribute** → [Contributing](../contributing/README.md)
