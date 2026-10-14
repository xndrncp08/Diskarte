# Diskarte release and recovery operations

## Safe migration and release order

1. Record the deployed application commit and current migration history. Keep a tested database backup, Storage object backup and protected environment configuration before changing production.
2. Apply all migrations to an isolated Supabase stack or staging project. Run the database/RLS suite and authenticated multi-user browser journeys there.
3. Review the pending SQL using `npx supabase db push --dry-run` from the repository root after linking the intended project. Review target project identifiers; do not place connection strings or tokens in logs, commits or screenshots.
4. Apply pending migrations in filename order, then release the application. The October 14 migrations are additive except for stricter event policies and extending the audit target constraint. Index creation may lock a busy production table; schedule and monitor it against the real dataset.
5. Check `/api/health` for process liveness and `/api/health?deep=1` for configured upstream readiness. The deep check covers Supabase Auth connectivity and required configuration; it is not an end-to-end database query or LiveKit media probe.
6. Smoke test login, public/private channel isolation, DM privacy, search, offline retry, event permissions, shared workspace conflicts and a two-user voice call. Compare Realtime subscription status and call diagnostics before considering the release successful.

Render is configured to deploy pushes to `main`. Ensure the hosting release gate and staging migration checks have passed before promotion. New Explore, global search and shared workspace screens report unavailable states when their migrations have not been applied; the ordinary server settings action omits new listing fields unless the user changes them.

## Backup and restore

Use Supabase's [backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for a complete logical export of roles, schema, data and migration history. Diskarte customizes Auth, Storage and Realtime policies/triggers, so those customizations must be included and verified during a restore.

Database backups contain Storage metadata, not the attachment/avatar/soundboard object bytes. Back up those objects separately and verify restoration; see [Supabase database backup coverage](https://supabase.com/docs/guides/platform/backups). Protect backups as private user data, restrict access, define retention and encryption, and never commit them to Git.

Restore into an isolated project first. Check user counts, community memberships, messages, attachments, RPC signatures, private Realtime authorization and RLS using member/non-member accounts. Re-enable the required Realtime publications and restore authentication redirects/provider configuration. A backup is not verified until a restoration drill succeeds.

No production backup, restore, or hosted migration was executed during the October 14 development session; authenticated management credentials were unavailable. Docker was unavailable locally; GitHub CI subsequently applied the migrations to a temporary Supabase stack and passed its full browser and Docker checks.

## Rollback

Re-deploy the previous application artifact/commit when an application regression is confirmed. Leave additive database columns, functions, indexes and shared documents in place: the older application ignores them. Preserve the stricter event visibility policy; restoring its previous policy would reintroduce the private-channel leak.

Do not delete shared documents, drop new tables or reverse migration history to roll back the UI. If a data/schema repair is required, prepare a forward migration against a restored copy, validate it and preserve an audit trail. Restore a database backup only for a confirmed data-loss incident after accounting for writes made since that backup.

## Troubleshooting

For the workspace error, run `npm run db:check --prefix diskarte`. This read-only check uses the app’s public Supabase configuration (loading `diskarte/.env.local` on Node 22) and never fetches document content or uses the service-role key. Exit 2 means the workspace schema is missing; exit 1 means configuration or connectivity prevented verification. An anonymous permission denial counts as schema presence, not a permission failure. This check does not establish authenticated editing or Realtime correctness.

If schema is missing, confirm the target project and backup first, then apply `supabase/migrations/20261014010000_shared_workspace.sql` using Supabase SQL Editor or the linked CLI in the migration order above. Rerun the check and test the workspace with an authorized account. A successful application deployment does not apply SQL migrations automatically.

| Symptom | Check and recovery |
| --- | --- |
| Explore/search/workspace unavailable | Confirm the three release migrations and RPC grants are applied to the same Supabase project used by the app. Do not loosen RLS to resolve errors. |
| API POST returns 403 before authentication | Check `SITE_URL`, reverse-proxy host/protocol and request Origin. For local testing on a non-default port, set `SITE_URL` to that exact origin. |
| Messages fail or remain queued | Reconnect and open the affected conversation. Use Retry/Retry sync. Stable UUIDs prevent duplicate insertion; do not manually replay with new IDs. The queue is bounded and per-account. |
| Stale chat after reconnect | Settings → Advanced → Connection diagnostics shows join/recovery events. Realtime must allow the private `db:*` topics. Check membership and session validity, then retry sync. |
| Shared save conflict | Review the latest revision in the editor. Local edits remain until the editor closes. Explicitly retain local edits against the new revision before saving again. |
| Voice cannot join/reconnect | Check the session, channel access, timeout, LiveKit configuration and browser microphone permissions. Never issue a broad room token to bypass membership. Diagnostics show reconnection and local quality events. |
| PWA appears outdated | Settings → Advanced exposes a pending update. Finish a call and save edits before reloading. Clear downloaded app files if necessary; this preserves drafts/queued sends. Change the service worker cache version when changing the offline precache. |
| Notifications stop | Check browser permission, quiet hours, temporary pause, server/channel mutes and sound settings. Background push is not enabled in this release. |

Request errors emit JSON metadata to the server's normal log stream. Client connection events stay in a bounded, in-memory log; no automatic third-party transmission is configured. These diagnostics intentionally omit message text, usernames, tokens, query strings and headers.

## Verification commands

Run from the repository root:

```sh
npm run lint --prefix diskarte
npm run typecheck --prefix diskarte
npm run test --prefix diskarte
npm run build --prefix diskarte
npm run test:e2e --prefix diskarte
```

The full authenticated suite additionally requires the local Supabase/LiveKit stack and `E2E_FULL=1`. Use throwaway accounts and infrastructure. The baseline smoke/a11y/mobile/PWA browser checks can run without a local backend; they do not establish authenticated app or media-call correctness.
