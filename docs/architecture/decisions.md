# Architecture decision records

Short records of decisions that shape the codebase. Each was reconstructed from the code, migration
comments and release notes; the date is when the decision shows up in history. New decisions use the
[ADR template](../contributing/templates/adr.md) and are appended here.

| # | Decision | Status |
| --- | --- | --- |
| [001](#001-authorization-lives-in-postgres) | Authorization lives in Postgres (RLS, triggers, definer RPCs) | Accepted |
| [002](#002-runtime-configuration-one-image) | Runtime configuration; one image for every environment | Accepted |
| [003](#003-private-realtime-channels-only) | Private Realtime channels only | Accepted |
| [004](#004-client-generated-message-ids) | Client-generated message ids for idempotent sends | Accepted |
| [005](#005-the-call-lives-in-the-root-app-layout) | The LiveKit call lives in the persistent app layout | Accepted |
| [006](#006-self-contained-app-folder) | Self-contained app folder, not an npm workspace | Accepted |
| [007](#007-hosted-only-jobs-outside-migrations) | Hosted-only jobs are installed outside migrations | Accepted |
| [008](#008-database-outbox-for-push) | Database outbox for Web Push | Accepted |
| [009](#009-additive-forward-only-migrations) | Additive, forward-only migrations applied by hand | Accepted |
| [010](#010-free-tier-first) | Free-tier first | Accepted |
| [011](#011-vercel-for-production) | Vercel for production, Docker kept portable | Accepted |
| [012](#012-no-emoji-glyph-vocabulary) | Vector glyph vocabulary instead of emoji | Accepted |

## 001. Authorization lives in Postgres

**Context.** The browser talks to Supabase directly (PostgREST, Realtime, Storage) for most reads and
many writes; Server Actions are only one of several paths.
**Decision.** Every table has RLS; field-level rules (who may change a role, pin, edit, move a
channel between servers) are `BEFORE` triggers raising coded exceptions (`ONLY_MODERATORS_CAN_PIN`,
`SLOWMODE`…); multi-step operations are `SECURITY DEFINER` functions with `search_path = ''` that
re-check `auth.uid()`. `anon` has no table privileges. The app never uses the service role for user
requests.
**Consequences.** One rule set covers every path. UI permission helpers (e.g. `canManageMember` in
[`lib/servers.ts`](../../diskarte/src/lib/servers.ts)) only *mirror* database rules to hide controls.
New functions must explicitly `revoke … from public, anon` because Supabase's default privileges grant
`EXECUTE` to `authenticated` and `anon`.

## 002. Runtime configuration, one image

**Decision.** [`lib/env.ts`](../../diskarte/src/lib/env.ts) reads `process.env` per request and
validates it with Zod; the root layout passes public values to the client through
`RuntimeConfigProvider` instead of `NEXT_PUBLIC_*` build-time inlining.
**Consequences.** The same Docker image runs locally, in CI and in production. Missing configuration
shows a `ConfigNotice` instead of crashing, and `/api/health` reports it.

## 003. Private Realtime channels only

**Context.** On 2026-10-02 production had Realtime's "Allow public access" off and public Postgres
Changes subscriptions silently delivered nothing.
**Decision.** All channels are private; `can_access_realtime_topic()` authorizes every topic prefix;
`subscribeDbChanges()` sets the socket's JWT before joining.
**Consequences.** New topics need a migration. CI can't catch a public subscription (local Supabase
allows them), so reviews must.

## 004. Client-generated message ids

**Decision.** The composer generates the message UUID; retries reuse it; the server treats a unique
violation as "already sent".
**Consequences.** Idempotent offline queues without a dedupe table; Realtime echoes reconcile by id.

## 005. The call lives in the root app layout

**Decision.** `CallProvider` is mounted by `app/(app)/layout.tsx`; settings open as a dialog.
**Consequences.** Calls survive navigation. A full reload (including after a deploy) still drops the
call, mitigated by the 30-second `sessionStorage` rejoin.

## 006. Self-contained app folder

**Context.** Render (and Vercel) build with Root Directory `diskarte` and can't see files above it.
**Decision.** The app has its own lockfile and Dockerfile; the root `package.json` only forwards
scripts. The retired early-access portal was deleted rather than shared.
**Consequences.** Nothing needed at build time may live outside `diskarte/`. Documentation and
migrations may.

## 007. Hosted-only jobs outside migrations

**Decision.** `pg_cron`, `pg_net` and Vault setup live in `diskarte/docs/sql/*.sql`, run once by the
database owner.
**Consequences.** Migrations run unmodified in PGlite and CI. Features degrade gracefully when the
jobs aren't installed (see [background-jobs.md](background-jobs.md)).

## 008. Database outbox for push

**Decision.** Triggers enqueue push work in the same transaction as the source row; an
authenticated HTTP dispatcher drains it with leases.
**Consequences.** No message is pushed for a rolled-back insert; access is rechecked at send time;
delivery is at least once. Requires `pg_net`, Vault and a reachable dispatcher URL.

## 009. Additive, forward-only migrations

**Decision.** Migrations add tables/columns/functions and replace functions; they don't drop user
data. They are reviewed and applied by hand (SQL Editor or `supabase db push`), never by a deploy.
**Consequences.** App rollbacks never require schema rollbacks — older code ignores new columns.
New features must tolerate a database that hasn't been migrated yet (hide the feature, show a
"couldn't" toast or an unavailable state).

## 010. Free-tier first

**Decision.** Defaults fit Supabase/LiveKit/Render free tiers: in-memory rate limits (Upstash
optional), lazy heavy SDKs, `NODE_OPTIONS=--max-old-space-size=384`, a 150 MB image budget enforced
in CI.
**Consequences.** On multi-instance hosts (Vercel), set Upstash for shared auth rate limits; the link
preview cache is per instance.

## 011. Vercel for production

**Context.** 2026-10-12: Render's free tier sleeps and cold-starts slowly.
**Decision.** Production runs on Vercel (`diskarte-ten.vercel.app`, functions next to the Supabase
region). The Docker image and `render.yaml` stay supported; the proxy 308-redirects page requests on
any host other than `SITE_URL`.
**Consequences.** Vercel deploys `main` on push, in parallel with CI — watch CI and load a page after
every push. Serverless instances don't share memory.

## 012. No-emoji glyph vocabulary

**Decision.** Reactions, statuses, badges and activities are `:code:` strings rendered as vector
icons by `<Glyph>` ([`lib/glyphs.ts`](../../diskarte/src/lib/glyphs.ts)); the database validates
reaction codes.
**Consequences.** Consistent rendering across platforms; custom server emoji use the same `:name:`
syntax backed by images.
