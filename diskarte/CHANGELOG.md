# Changelog

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
