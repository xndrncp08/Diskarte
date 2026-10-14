# Changelog

## 2026-10-14

- Added mobile destination tabs, keyboard-aware viewport, persistent call strip, swipe-to-reply and virtualized DM history.
- Restored optional floating desktop panels and added a lazy keyboard navigation palette.
- Added public community discovery, permission-aware global message search and historical message context.
- Added channel-scoped shared notes, task boards and database-clock focus timers with concurrency checks.
- Added safe PWA static caching, offline fallback, install/update controls, persistent local drafts, upload retry/cleanup, quiet hours and accessibility surface controls.
- Fixed message retry identity, queue account isolation, concurrent rollback, cancelled call joins, muted rejoin behavior and reconnect history gaps.
- Restricted private-channel events and RSVP visibility; added structured server errors and session-only connection diagnostics.
- Expanded database, security, UI, concurrency, recovery, PWA and performance regression tests.

See [delivery scope and limitations](RELEASE-2026-10-14.md) and [migration/recovery operations](OPERATIONS.md). The full platform master prompt is not complete; hosted migrations, live deployment, hardware testing and the authenticated multi-user browser suite remain pending.
