# Diskarte handoff — 2026-11-12 (privacy database repair: DONE)

## State

- Branch `fix/privacy-database-readiness` (pushed; open a PR to main so CI runs — no `gh` locally).
  App code unchanged; only SQL bundles, DB tests and this file. Main/prod app commit: `3e94705`.
- Production Supabase `vyxqudcxlfsdjyugjwhb` (org "Diskarte", **Free plan: no daily backups, no
  PITR**). Never touch `Resoniq` (`ptdhmmhsdccbvvijnbqc`), visible from another connector account.
- Prod has no `supabase_migrations` history: never `db push`. Use guarded bundles instead.

## What happened

1. Privacy hardening (`20261109000000`, `20261109020000`) was already in prod when access returned
   (applied out of band between sessions). Verified: all 8 functions match repo md5, triggers
   enabled, constraint validated, old avatar policy gone, 1 Invisible choice kept privately,
   16 profiles / 10 audit rows intact, 0 untagged channel audit rows.
   `diskarte/docs/sql/privacy-repair.sql` (+ `tests/db/privacy-repair.test.ts`) was not needed;
   kept as the rehearsed record.
2. Whole-schema drift check found prod also missing `20261014030000..090000` and
   `20261107000000` (later migrations were applied over the gap). Applied 2026-11-12 via
   `diskarte/docs/sql/production-catchup.sql` (commit `8f1347a`), rehearsed by
   `tests/db/production-catchup.test.ts` on a DB built with `createDb({ skip })`.
   Not verbatim: skips Hangouts-superseded `create function can_upload_dm_attachment` (applies its
   revoke — anon could execute it before), puts account_export_sync's body into
   `export_my_data_base` without re-granting it. Preflight/postcheck = fingerprint of the whole
   public schema (fn+ACL, columns, constraints excl. NOT NULL, indexes, policies incl.
   storage/realtime, triggers, RLS, table ACLs, realtime publication).
3. After: prod fingerprint == full-migration fingerprint in every category. Rows unchanged,
   rsvp_count correct, `release_announcements` empty (`RELEASE_ANNOUNCEMENTS` not set in Vercel, so
   no auto-post).

## Verified in prod (rolled-back probes, aggregates only)

16 users: 0 leaked private-channel audit rows, 0 leaked edit history, 0 public `invisible`
statuses, 0 other users' privacy rows, Invisible user absent from friends_activity; on the HQ topic a
visible member may publish presence, the Invisible member gets 42501. Anon: privacy_settings 42501,
avatar listing 0 rows, can_upload_dm_attachment 42501. `/api/health?deep=1`, `/login`, `/docs` 200.

## Remaining / follow-ups

- Push done; PR + CI pending (owner: open PR from the branch; CI runs only on PRs/main).
- Advisors (pre-existing, same as repo schema, untouched): 20 anon-executable SECURITY DEFINER
  functions (mostly trigger fns, `get_invite`, `username_available`, `record_site_visit`, …),
  authenticated-executable definer fns, leaked-password protection off, one RLS-no-policy INFO.
- Free plan: take regular `pg_dump` backups (`/opt/homebrew/opt/postgresql@17/bin/pg_dump`).
- Unverified: physical devices, Safari/Firefox, screen readers, authenticated end-to-end prod flows,
  Pulse backend acceptance. Classic default, `pulseOptIn=false` unchanged.
- For future drift checks: compare `fingerprint` query in production-catchup.sql against
  `createDb()` locally; PGlite counts NOT NULL constraints (exclude contype 'n') and sorts with C
  collation (always `collate "C"`).
