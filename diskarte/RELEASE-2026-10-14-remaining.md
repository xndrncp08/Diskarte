# Remaining-platform follow-up — October 14, 2026

This report continues [the earlier delivery](RELEASE-2026-10-14.md). It covers implemented changes, not completion of the entire platform master prompt. No AI capabilities were added. The previous AI report action and its GitHub workflow were removed; reports, manual triage, stored issue links and audit records remain.

## Implemented functionality

- **Private cross-device state:** account-owned drafts and display/notification preferences, version checks, offline-local preservation, explicit conflict choices and reconnect refresh. Draft clearing synchronizes after sending. JSON key order does not cause false edits or write loops. Device-local fallback remains available when the migration/network is unavailable.
- **DM media:** image, GIF, video, audio and recorded voice attachments using the existing allow-list and 10 MB limit. Preview, optimistic delivery, retry/outbox, signed media, deletion cleanup and permission-aware attachment search share the existing channel implementation. Uploads are private before sending; the database verifies stored object metadata, participant permissions and the uploader's conversation path. Arbitrary document formats such as PDFs remain unsupported.
- **Conversation recovery:** restore a tab's reading anchor and intra-row offset, loading older pages until the anchor is found; cancel restoration when jumping to latest. Reconnect refreshes bounded reaction snapshots without losing concurrent live/optimistic changes. Positions do not persist after closing the tab.
- **Community administration:** Gaming, Friends, Study, Creator and Team creation templates; read-only resource/announcement channels and forum defaults where appropriate. Owner-only JSON **settings** export includes channel/role/emoji configuration and excludes invite secrets. Existing ownership-transfer and custom emoji workflows were retained. Discovery now paginates, deduplicates results and recovers from failed joins/requests.
- **Collaboration:** channel-scoped HTTPS resource collections and SVG whiteboards in the shared workspace. Members share saved versions; concurrent saves require an explicit version choice. Database authorization reuses workspace membership, channel privacy, verification, timeout and read-only rules. Content, IDs, links, colors, coordinates and point counts are bounded. This is revisioned saved collaboration, not live stroke streaming or CRDT merging. Existing note/board/focus document types remain compatible with older clients. Revoked channel access clears cached workspace views.
- **Events:** database-enforced attendance limits; atomic counts prevent overbooking and drift on ignored duplicate RSVPs. Members can withdraw from full events. Weekly creation supports 4, 8 or 12 independently editable occurrences in the device time zone, in one atomic batch with stable IDs for safe retry. This is finite recurrence, not an infinite recurrence scheduler. A permission-aware summary returns canonical counts and only the caller's RSVP, avoiding full attendee downloads and PostgREST row truncation.
- **Account safety:** data exports include private synced state and DM attachment metadata, with explicit MFA checks. Account deletion removes synced state and media-bearing DMs; event creator attribution can become null during system deletion without permitting client creator changes. A reproduced event-attribution deletion failure now has a regression test.

## Mobile, desktop and appearance

- Root visible-viewport variables now reach portal dialogs. Dialogs, full-screen mobile windows, popovers and context menus respect keyboard-sized/panned visual viewports and safe areas; desktop floating behavior remains.
- Opening dialogs/popovers preserve an input that the user has already focused instead of stealing focus on a delayed animation frame.
- Dark, light and OS-following appearance retain Diskarte accent themes and glass surfaces. Cookie-backed initial mode avoids incorrect startup colors; system detection uses the existing CSP nonce. Light forms, Markdown, links and status colors were adjusted, while call/media surfaces retain their dark palette.
- English/Filipino infrastructure translates core mobile navigation and settings headings. Time-zone selection, device reset and 24-hour clock preferences affect timestamps and daylight-saving-sensitive relative dates. **Full application translation is unfinished.**

## Database and architecture

New forward migrations, in order:

1. `20261014020000_account_state.sql`
2. `20261014030000_dm_attachments.sql`
3. `20261014040000_reaction_snapshot.sql`
4. `20261014050000_community_templates.sql`
5. `20261014060000_workspace_assets.sql`
6. `20261014070000_event_capacity.sql`
7. `20261014080000_account_export_sync.sql`
8. `20261014090000_account_cleanup.sql`

All build-time code remains inside the self-contained app. No dependencies or services were added. Account sync uses the existing authenticated client and private Realtime lifecycle. New mutations validate caller identity/permissions inside PostgreSQL and pin security-definer search paths. Search and summary functions retain invoker RLS. Additive workspace assets avoid expanding the older clients' document-kind contract.

`npm run db:check --prefix diskarte` performs nine read-only probes using the public/anon key: tables are queried with `limit=0`; RPC probes are read-only. Missing schema is distinct from denied anonymous access or invalid credentials. It never executes save/delete/scheduling functions.

## Verification and performance

- Before final integration: **806 tests passed across 130 files**; lint, Next type generation/TypeScript and production build passed. After integration, **807 tests passed across 130 files in 57.92 seconds**, and lint, type checking and the production build passed again. Hosted CI results will be recorded separately.
- Local production Chromium: **28 passed, 23 infrastructure-gated checks skipped**. Includes light/system axe checks, public mobile touch/overflow checks at 320/375/390/768/1440 px, PWA/cache/auth/security smoke checks. Authenticated new journeys cover device drafts/conflicts/appearance, private DM uploads, shared resources/whiteboards and capacity-limited events in CI's temporary backend.
- PGlite applies all migrations on fresh databases, then tests old and new workflows, private-channel/DM boundaries, malformed uploads/content, revision conflicts, timeouts, MFA, ownership transfer and account deletion. This verifies forward compatibility with tested existing callers; a production database upgrade/restore has not been executed.
- Event loading changes from two requests plus all RSVP identities to one bounded summary request. A component fixture verifies that a canonical count of 1,001 renders correctly without fetching attendee rows. No production query-latency improvement is claimed.
- Appearance-stage vs final build: all emitted client JS totals **3,772,581 → 3,784,196 bytes**; independently gzip-compressed chunks **1,136,299 → 1,139,595 bytes** (+3,296 bytes, +0.29%). These include every lazy route/chunk, not initial-page transfer. No bundle reduction or hardware frame-rate gain is claimed. No production-sized load benchmark was run.

## Integration and operations

Integration branch is `main`, remote `origin` (`xndrncp08/Diskarte`). The remote was fetched and main had no divergence before integration. All following focused branches were integrated with non-fast-forward merges, with no conflicts. Existing untracked `diskarte/scripts/_preview.tsx` was preserved.

| Workstream branch | Implementation commit |
| --- | --- |
| `feat/account-sync` | `67c8c5c` |
| `feat/dm-attachments` | `f615c3f` |
| `feat/history-recovery` | `f6f435b` |
| `feat/community-administration` | `483040f` |
| `feat/appearance-language` | `1a6a93a` |
| `fix/mobile-dialog-viewport` | `37ad507` |
| `feat/workspace-resources` | `669044a` |
| `feat/event-capacity` | `76cfcdb` |
| `fix/non-ai-reports` | `0a08e5d` |
| `fix/dialog-focus` | `28e5ce9` |
| `fix/database-readiness` | `dd54e45` |
| `test/platform-regressions` | `71b4166`, `3bf85b8` |
| `fix/account-cleanup` | `5d70055` |

The final workstream merge is `afa9322`. No force pushes, unrelated branch deletions, attribution trailers or production SQL mutations were used.

The connected project now has the original workspace documents/permission function. The eight new migrations remain pending: the expanded readiness command returns exit **2**, correctly. Supabase CLI is signed out; no database URL or management token is configured. Production service-role, background-job and VAPID credentials are unavailable. No hosted migration, production backup/restore or live deployment is claimed. Pushing main can trigger the existing Render automation; hosting success still needs verification.

Apply reviewed migrations in order on staging first, verify permissions and take a verified backup including Storage bytes before production promotion. Roll back the app while retaining additive database structures; prepare forward repairs instead of dropping user data. See [operations](OPERATIONS.md).

## Unfinished scope and practical limits

These are **not implemented in this follow-up**, mostly because they require further product/backend work, not just credentials:

- Developer/bot applications and accounts, scoped credentials/rotation, webhooks, slash commands, interactions, OAuth installs, app discovery/review and management.
- Deterministic visual automation, workflow templates, execution history, safe testing, failure recovery and rate-limited dispatch.
- Optional XP, achievements, role rewards, leaderboards/challenges and anti-farming rules.
- Durable scheduled-message execution, Web Push delivery/actions, event reminders and attendance tracking. Server-side workers and secure signing/management configuration are needed; none is fabricated.
- Saved searches/history, full user/event/resource indexing, image cropping, custom sticker management and complete non-media file attachments.
- Membership approval/screening questionnaires, configurable verification levels, complete community data exports/analytics and advanced stage/announcement workflows.
- Shared workspace presets/layout replication, live concurrent stroke merging, study summaries/goals, authorized shared listening and collaborative media queues.
- Ban appeals, raid detection and expanded deterministic moderation escalation/retention controls.
- Complete Filipino translations and every remaining settings subsection (including user-editable keybind conflict management and broader device/data controls).

Physical iOS/Android keyboard behavior, foldables, background call quality, mobile hardware permissions, real throttled-network voice recovery and production backup restoration remain unverified. Existing browser call journeys use fake media devices; they do not establish physical-device call quality. AI features are intentionally excluded indefinitely, not pending configuration.
