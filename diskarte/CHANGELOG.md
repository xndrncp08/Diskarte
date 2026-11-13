# Changelog

## 2026-11-13 — Diskarte Pulse opt-in

- Added the Canvas experience: unified Spaces navigation, transcript-style conversations, contextual members/pins/details, new typography and warm dark/off-white light surfaces.
- Added phone navigation for Home, People, Spaces and You, full-screen conversations, deterministic Back navigation and touch action sheets.
- Added the Pulse voice Stage, live call strip, labelled controls and reconnecting, blocked-sound and microphone recovery states.
- Opened **Settings → Appearance → Try the new Diskarte** to everyone on production (`DISKARTE_PULSE_ROLLOUT=opt-in`). Classic remains the default; **You → Back to Classic** or the switch returns at any time, and unsetting the flag withdraws the public switch on the next deployment.
- Retained shared account, message, notification and call behaviour across both shells. Added regression checks for switching without losing conversation work.
- Pulse adds no migrations. Optional community identity remains on its separate branch (`20261109010000_community_identity.sql`); Pulse uses the default appearance without its fields.
- Added a backend acceptance journey (`e2e/pulse.spec.ts`, run by CI under the public opt-in) covering opt-in persistence, per-user route gating, real-time chat between a Pulse and a Classic account, mention badges, LiveKit voice kept across browsing and the switch back, phone navigation and keyboard access. See the [release notes](RELEASE-PULSE.md) and [rollout record](../docs/design/pulse-rollout.md).

## 2026-11-08 — Hangouts, membership screening, suggestion boards, reminders

- Added Instant Hangouts: temporary group chats with a call for you and 1–9 friends, lasting 1–24 hours. Start one from Home, jump straight into voice and ring everyone; anyone adds an hour, the host keeps it, turns it into a Tambayan or ends it. Expired hangouts are deleted with their messages and take no file uploads.
- Added friends who are around on Home: online friends first, their status and the voice channel they're in when you can see it. Invisible friends and anyone who turns off Settings → Privacy → "Show friends when I'm around" never appear.
- Added membership screening: up to 5 joining questions and optional moderator approval, with a live queue in Server settings → Membership, a sidebar nudge for moderators and audit-log entries. Answers are included in the applicant's data export.
- Added forum tags, Solved posts and pinned-first sorting, and suggestion boards with one-per-member upvotes, Top sorting and moderator statuses (Under consideration, Planned, In progress, Completed, Declined).
- Added Remind me… on server messages: saved with a time and shown with a jump link (and a desktop notification when enabled) while Diskarte is open.
- Needs four migrations: `20261108000000_hangouts.sql`, `20261108010000_membership_screening.sql`, `20261108020000_forum_tags_suggestions.sql`, `20261108030000_message_reminders.sql`. Existing features keep working without them; until they're applied the new actions fail with an error message.

## 2026-11-07 — smoother start, dependable notifications, release posts

- Fixed unread state missing a message sent within half a second of opening a conversation or of reading it (also the cause of the intermittently failing notification E2E journey): unread is now an exact comparison of database timestamps.
- Fixed read DMs and channels coming back as unread on devices whose clock runs behind the server: receipts now cover the newest message shown.
- Added a Getting started checklist and a What's New card on Home, with Filipino strings; a first-time greeting replaces "Welcome back" for new members.
- Added official release announcements: each production deployment posts its developer-written release notes (src/content/releases.json) once to Diskarte HQ #announcements as "Diskarte Updates" with an Official badge; super admins can retry, withdraw or republish in the Control Center.
- Added a plain-language Privacy and your data page, linked from the landing page, sign-up form and Help Center.
- Needs migration `20261107000000_release_announcements.sql`, then `RELEASE_ANNOUNCEMENTS=on` (Production only) with `SUPABASE_SERVICE_ROLE_KEY`, for the release posts. Everything else works without it.

## 2026-11-06 — Help Center

- Added the public Help Center at `/docs`: user guides, help and troubleshooting, the feature reference, developer docs, the API reference and this changelog, with search (Ctrl/⌘ K), section filters, breadcrumbs, an on-page contents list, previous/next links, copyable code, rendered diagrams, product screenshots, dark/light/system modes and a phone layout.
- Added contextual help links in Settings (every section), server settings, the voice lobby, the shared workspace, an empty Tambayan and the sign-in page, plus Help Center links on the landing page.
- Added "Suggest an improvement" on every docs page (signed-in feedback goes to the existing report queue; anyone can open a GitHub issue).
- Updated zod to 4.6.7 (memory-exhaustion advisory) and added Mermaid 12 for diagrams; the production dependency audit reports zero vulnerabilities.
- No database migrations or environment changes are needed.

## 2026-10-30 — community tools

- Added built-in slash commands in the composer: /shrug, /tableflip, /unflip, /me, /spoiler (Tab completes).
- Added server rules: members accept them before posting (moderators exempt; editing them asks again), enforced in the database.
- Added recurring announcements (Server settings → Announcements): daily or weekly posts at a local time, with last-failure reporting.
- Needs two manual migrations; see `RELEASE-2026-10-29.md` (steps 8–9).

## 2026-10-29 — social, scheduling and integrations

- Fixed the mobile tab bar no longer matching the page colour behind the app (surface refactor regression).
- Added favourite friends (listed first), custom statuses that clear after 30 min / 1 h / 4 h / 24 h, and mutual friends + shared Tambayans on member profiles.
- Added scheduled messages in text channels (up to 30 days ahead, 25 pending per person) with a pending/failed list and cancel; they post as the author under the same rules as a live send.
- Added Sent / Seen receipts under your latest DM (named readers in groups).
- Added optional community levels per Tambayan: 15 XP per message at most once a minute, a leaderboard, levels on member profiles, admin reset.
- Added incoming channel webhooks (Server settings → Webhooks) at `POST /api/webhooks/<id>/<token>`, hashed one-time-shown tokens, rotation, audit log entries and per-webhook + per-IP limits.
- Added welcome messages for new members (channel + template with `{user}` / `{server}`).
- Added optional Moments on Home: 24-hour text/photo updates for all friends or favourites only, with mute, report and delete.
- Account export and deletion now cover favourites, scheduled messages, moments (incl. photos), mutes and XP.
- Needs seven manual migrations and one optional cron job; see `RELEASE-2026-10-29.md`.

## 2026-10-15 — live voice activity and Web Push

- Added authorized LiveKit hover previews and mobile long-press sheets, with shared Realtime updates and signed webhook invalidation.
- Added a private, transactional Web Push outbox, per-device session-bound subscriptions, leased dispatch, retries, event reminders, and invalid endpoint cleanup.
- Prevented delayed push registration/reconciliation from restoring an account binding after logout; failed reconnects preserve existing subscriptions.
- Added notification installation guidance, device management, synchronized delivery preferences, safe deep links, and private lock-screen defaults using the existing service worker.
- Added queue/RLS, transport encryption, permission, worker-only browser, and interaction regressions; restored dialog focus as soon as dismissal begins.
- Updated Next.js to 16.4.1, Sharp to 0.35.5 and source-map-js to 1.2.2; the production dependency audit reports zero vulnerabilities. ESLint’s unpatched development dependency advisories remain documented.
- Push remains disabled until production secrets and the reviewed database setup are configured. See `docs/web-push.md`.

## 2026-10-14 — remaining-platform follow-up

- Added revisioned private draft/preference sync, private DM media, history anchors and reconnect reaction reconciliation.
- Added community templates/settings export, discovery pagination, shared resources and saved collaborative whiteboards.
- Added atomic event capacity, canonical RSVP summaries and finite weekly scheduling.
- Added light/system appearance, core Filipino navigation/settings translations and time-zone preferences.
- Improved keyboard viewport overlays and focus behavior; secured account export/deletion for newly persisted data.
- Removed the AI report action/workflow while retaining manual reports and history.
- Expanded migration readiness checks and multi-user browser regression coverage.

See [the follow-up delivery report](RELEASE-2026-10-14-remaining.md) for exact results, migrations and unfinished scope.

## 2026-10-14

- Distinguished missing workspace migrations from connection, session and permission failures; added a read-only database readiness command and CI gate.
- Added moderator event editing with concurrent-change detection, confirmed cancellation and timezone-safe calendar export; improved mobile form sizing, RSVP request deduplication and reconnect refresh.
- Prevented abandoned conversation recovery requests and deferred bottom-scroll callbacks from affecting a later view.
- Recovered missed event/RSVP deletion notifications with bounded, permission-checked refresh while Events is open; suspended polling for hidden, offline and closed views.
- Added mobile destination tabs, keyboard-aware viewport, persistent call strip, swipe-to-reply and virtualized DM history.
- Restored optional floating desktop panels and added a lazy keyboard navigation palette.
- Added public community discovery, permission-aware global message search and historical message context.
- Added channel-scoped shared notes, task boards and database-clock focus timers with concurrency checks.
- Added safe PWA static caching, offline fallback, install/update controls, persistent local drafts, upload retry/cleanup, quiet hours and accessibility surface controls.
- Fixed message retry identity, queue account isolation, concurrent rollback, cancelled call joins, muted rejoin behavior and reconnect history gaps.
- Restricted private-channel events and RSVP visibility; added structured server errors and session-only connection diagnostics.
- Expanded database, security, UI, concurrency, recovery, PWA and performance regression tests.

See [delivery scope and limitations](RELEASE-2026-10-14.md) and [migration/recovery operations](OPERATIONS.md). GitHub CI passed the full authenticated browser suite and Docker checks. The full platform master prompt is not complete; production migrations, live deployment, hardware testing and the explicitly listed product work remain pending.
