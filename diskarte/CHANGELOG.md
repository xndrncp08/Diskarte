# Changelog

## 2026-10-29 — social, scheduling and integrations

- Fixed the mobile tab bar no longer matching the page colour behind the app (surface refactor regression).
- Added favourite friends (listed first), custom statuses that clear after 30 min / 1 h / 4 h / 24 h, and mutual friends + shared Tambayans on member profiles.
- Added scheduled messages in text channels (up to 30 days ahead, 25 pending per person) with a pending/failed list and cancel; they post as the author under the same rules as a live send.
- Added Sent / Seen receipts under your latest DM (named readers in groups).
- Added optional community levels per Tambayan: 15 XP per message at most once a minute, a leaderboard, levels on member profiles, admin reset.
- Added incoming channel webhooks (Server settings → Webhooks) at `POST /api/webhooks/<id>/<token>`, hashed one-time-shown tokens, rotation, audit log entries and per-webhook + per-IP limits.
- Added welcome messages for new members (channel + template with `{user}` / `{server}`).
- Needs five manual migrations and one optional cron job; see `RELEASE-2026-10-29.md`.

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
