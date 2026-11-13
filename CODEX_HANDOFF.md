# Diskarte handoff — 2026-11-12

## Current task and authorization

Prepare a validated repair for production's missing privacy schema. **Do not apply production
migrations until the owner explicitly approves the exact, tested execution plan.** A guarded, rehearsed repair bundle now exists (see “Repair bundle” below); it still needs a
read-only prod preflight before the owner can approve it.

Use one agent. Preserve existing work. No new UI/features, public Pulse activation, announcements,
RLS weakening, production resets, or automatic retries of uncertain writes. Read root/app
`AGENTS.md`; use Supabase and Postgres skills for database work. Do not expose credentials.

## Git and completed Pulse work

- Repository root: `/Users/derrancap/Der's Projects/diskarte`.
- Current branch: `fix/privacy-database-readiness`, newly created from `main`; no new commits.
- HEAD, local `main`, and `origin/main`: `3e94705022226e684850dc8f9d7a3da2ea5d0678`.
- [PR #2](https://github.com/xndrncp08/Diskarte/pull/2) already merged `feat/pulse` with a normal
  merge commit. Its tree is identical to feature head `32220c4`. No duplicate PR/merge is needed.
- `feat/pulse` and `origin/feat/pulse` remain at `32220c4`; worktree:
  `.claude/worktrees/pulse-integration`.
- Voice `54875a8`, mobile `f3c0031`, privacy release `0801281`, and all core Pulse branches are
  already ancestors of merged main. Do not independently merge/push the privacy-release branch.
- Pulse includes Canvas navigation, messaging, mobile, voice/recovery, accessibility, docs and
  controlled opt-in. `c083c6e` preserves calls, conversation state, uploads and edits during shell
  switches; `3d3b5c3` adds switch/gate tests; `32220c4` records validation.
- Optional `feat/community-identity` (`f4e28fa`) remains separate. Do not sweep it into the repair.
- Before this file, tracked files were clean. `.agents/` and `.codex/` are pre-existing untracked
  owner files. Other worktrees and their dependency links were preserved. Repair work is uncommitted
on `fix/privacy-database-readiness` (see below).

## Verified CI and deployment

[Merge CI](https://github.com/xndrncp08/Diskarte/actions/runs/43150525729) succeeded:
**1,160 tests / 191 files**, **67 experience checks** (3 optional screenshot skips),
**82 E2E checks** (2 intentional skips), plus quality/build and Docker jobs.
E2E used isolated Supabase and LiveKit with `E2E_FULL=1`. The earlier local 28 skips were actually
27 backend tests plus one docs screenshot; those 27 backend tests now passed CI. Remaining CI
E2E skips: optional docs screenshot and brute-force test, because CI raises the auth rate limit.
Backend journeys use Classic selectors; fixture Pulse coverage is not full Pulse backend acceptance.

Vercel already deployed main automatically before the latest continuation:
`dpl_Co5BSxZgYBTjskBtUuawXY6NMQm6`, READY, commit `3e94705`.
Read-only checks of `https://diskarte-ten.vercel.app` confirmed `/login` and `/docs` return 200,
Classic is default, and public runtime `pulseOptIn=false`. An unauthenticated Pulse cookie still
renders Classic. `/api/health?deep=1` returns 200; this does **not** prove migration readiness.
No production migrations, flag changes, announcements or new deployment were performed here.

## Production database findings — current repair scope

The deployed site's Supabase URL matches the connected project:
`vyxqudcxlfsdjyugjwhb` (`https://vyxqudcxlfsdjyugjwhb.supabase.co`), project name
`xndrncp08's Project`, `us-east-1`, ACTIVE_HEALTHY, PostgreSQL 17.6.
Supabase MCP read-only catalog queries verified:

- `privacy_settings.invisible` is absent (REST probe returns PostgreSQL `42703`).
- `profiles_hide_invisible` trigger/function and `profiles_status_not_invisible` constraint absent.
- Restrictive Realtime policy `invisible users publish no presence` absent.
- `audit_logs.channel_id` and `channel_private`, audit tagging/backfill functions/trigger, and
  `can_read_audit_channel` absent. Existing audit/edit-history policies remain the older versions.
- Old storage policy `avatar images are publicly readable` remains; replacement uploader policy absent.
- Relevant existing tables have RLS enabled. Do not disable it.
- Migration list is empty and `supabase_migrations.schema_migrations` does not exist. This appears
  to be a manually managed schema: **do not blindly run every repository migration/db push**.
- Aggregate sizing: 16 profiles, 1 legacy Invisible profile, 0 privacy-setting rows, 10 audit rows
  (5 channel references). No production user records were copied or changed.

Detailed before-catalog (columns, constraints, policies, triggers, function SQL/ACLs, counts):
was in `/private/tmp/diskarte-privacy-catalog-before.json` — **now deleted (tmp cleared)**.
Required function dependencies exist by name, but complete definition/dependency comparison is pending.

## Migration review and validation still to do

Prefer these existing files, in this order, after dependency verification:
1. `supabase/migrations/20261109000000_privacy_hardening.sql` (407 lines).
2. `supabase/migrations/20261109020000_avatar_listing.sql` (31 lines).

The first moves legacy Invisible choices into owner-only settings, normalizes their public status
without changing public `updated_at`, blocks Invisible presence, updates activity/heartbeat/topic
authorization, and protects private audit rows/edit history. The second restricts avatar metadata
listing while retaining public image URLs and authorized uploads/deletion.

These files are **not replay-safe/idempotent**: unguarded ADD COLUMN/constraint/trigger/policy and
named DROP POLICY statements require verified preconditions. They have no outer transaction.
Review atomic wrapping, lock/statement timeouts, concurrent profile updates, backfills, grants,
managed Realtime/Storage compatibility and history recording before proposing production commands.
Do not use the commented rollback blindly: it drops privacy columns and restores weaker policies.
Prefer transaction rollback on failure and a reviewed forward recovery. Backup/PITR availability
and a restorable backup have not been verified. No production execution bundle has been prepared.

Useful dependency definitions are in `20261108000000_hangouts.sql`,
`20261108010000_membership_screening.sql`, `20261006000000_admin_control_center.sql`, and
`20260927000000_community.sql`; inspect actual catalog definitions for drift first.

Available isolated-test tools: native PostgreSQL **17.11** at
`/opt/homebrew/opt/postgresql@17/bin/{initdb,pg_ctl,psql,createdb,pg_dump}`. Default PATH PostgreSQL
is 16.15; use the explicit 17 binaries. Docker and Supabase CLI are absent. Existing PGlite tests
use `diskarte/tests/db/harness.ts` and `supabase-shim.sql` (managed-service stand-ins).
No new isolated upgrade rehearsal or focused tests have been run in this repair task yet.

Next: reconstruct a pre-repair isolated database with synthetic visible/Invisible users and legacy
audit data, compare affected production definitions, apply the full sequence transactionally,
test preservation/rollback/replay failure, then run focused privacy/RLS/realtime/private-channel,
presence, webhook, activity and messaging tests. Existing starting points:
`tests/db/privacy-hardening.test.ts`, `avatar-listing.test.ts`, `privacy.test.ts`,
`private-channels.test.ts`, `tests/ui/PresencePrivacy.test.tsx`, and `tests/admin/live-session.test.tsx`
(all under `diskarte/`). Do not claim these historical tests validate a new upgrade rehearsal.

## Documents and remaining release gates

- `docs/security.md`, especially “Privacy hardening (2026-11-09)” and residual risks.
- `docs/design/pulse-rollout.md`: reconstructed 15 journeys; original approved definitions still
  unrecovered. Its local-only acceptance record predates the successful merge CI.
- `/private/tmp/diskarte-pulse-release-readiness-2026-11-12.md`: updated merge/CI/production report,
  exact 28 earlier skipped tests, missing migration finding, and rollback considerations.
- Physical iOS/Android/PWA, Safari/Firefox, screen readers, Pulse-specific backend acceptance and
  authenticated production workflows remain unverified. Cached Realtime authorization and older
  tabs are documented residual privacy risks; do not promise immediate revocation for old sessions.

After investigation and isolated tests, present exact files/order, SQL/commands, locking/data risks,
results and backup/recovery strategy, **then request explicit production authorization and stop**.
No approval to apply production migrations has been given.

## Repair bundle — progress 2026-11-12 (later session)

Uncommitted on `fix/privacy-database-readiness` (not pushed, nothing run on prod):
- `diskarte/docs/sql/privacy-repair.sql`: `begin` + `lock_timeout 3s`/`statement_timeout 60s` +
  read-only preflight DO block + both migrations **verbatim** + postchecks + `commit`. Preflight
  aborts if repair objects already exist, if the two policies it drops are missing, if
  `profiles_set_updated_at` is missing, or if `friends_activity`, `heartbeat_device`,
  `can_access_realtime_topic`, `channels_audit` differ (md5 of prosrc) from the latest repo
  definitions before 20261109000000. Postchecks: no public `invisible`, every legacy Invisible user
  has `privacy_settings.invisible`, their `profiles.updated_at` unchanged, profile/audit row counts
  unchanged, no untagged channel audit rows, old avatar policy gone, new policies/triggers present.
  Run: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f diskarte/docs/sql/privacy-repair.sql` (or paste whole).
- `diskarte/tests/db/privacy-repair.test.ts` (6 tests, PGlite) rehearses on a pre-repair DB
  (`createDb({ before })` added to `harness.ts`) seeded with 2 legacy Invisible users (one with an
  existing privacy row) and public/private/deleted-channel audit rows: verbatim check, forced failure
  before COMMIT → snapshot identical, apply → data preserved + moderator/admin audit visibility +
  heartbeat reports invisible, second run refused with no change, pre-Hangouts DB refused.
  The rehearsal found and fixed a preflight bug (`text[] || 'literal'` → `array_append`).
- Verified: full `tests/db` 54 files/299 tests pass; `tests/docs` pass; eslint clean.
- Not covered by PGlite: real lock contention, managed Realtime partitioned `realtime.messages`,
  Supabase `storage` ownership. Native PG17 rehearsal not done (shim needs managed-schema stand-ins).

**Blocker:** Supabase MCP now returns “You do not have permission to perform this action” for every
call (even `list_migrations`), so the prod preflight/drift check could not run. Biggest open risk:
the 20261108* migrations (Hangouts etc.) may be missing in prod — then the preflight refuses
(`missing function public.friends_activity()` or “differs”) and the repair scope grows to those
migrations first (and possibly older 2026-10-14 gaps, see memory). Next step once access returns
(or owner runs it): execute **only the preflight DO block** (read-only) on prod and record the result;
also confirm PITR/backup availability. Then present the plan and request explicit approval.

## Preflight status — 2026-11-12 (third session)

- Repair committed as `75bf593` on `fix/privacy-database-readiness` (not pushed).
- Supabase MCP now authenticates to a different account: `list_projects` shows only `Resoniq`
  (`ptdhmmhsdccbvvijnbqc`, unrelated — do not touch). Diskarte prod `vyxqudcxlfsdjyugjwhb` is not
  visible, so no prod catalog/backup check is possible from here. Live `/login` HTML still references
  `vyxqudcxlfsdjyugjwhb.supabase.co` (prod target confirmed).
- Preflight (bundle lines 25–72) reviewed: one DO block, catalog SELECTs + local variables + raise
  only. Owner was given it wrapped in `begin transaction read only; … rollback;` plus a read-only
  report query (function md5s, 20261108 tables/columns, legacy invisible count); both dry-run OK locally.
- Reference md5s to read the owner's report: post-20261108 (expected) `can_access_realtime_topic`
  `32df48d5…`, `friends_activity` `492a6f9f…`; pre-20261108 `can_access_realtime_topic`
  `89ccd1d2…` and no `friends_activity` → apply 20261108000000..030000 (rehearsed) before the repair.
- Backup/PITR still unverified; owner to check Dashboard → Database → Backups and/or take a pg_dump
  with local PG17 (`/opt/homebrew/opt/postgresql@17/bin/pg_dump`).
