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
| [013](#013-help-center-rendered-at-authoring-time-inside-the-app) | Help Center rendered at authoring time inside the app | Accepted |
| [014](#014-release-announcements-published-by-the-deployment-itself) | Release announcements published by the deployment itself | Accepted |
| [015](#015-hangouts-are-temporary-group-conversations) | Hangouts are temporary group conversations | Accepted |
| [016](#016-pulse-ships-behind-a-per-browser-shell-preference) | Pulse ships behind a per-browser shell preference | Accepted |

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

## 013. Help Center rendered at authoring time inside the app

**Status.** Accepted — *2026-11-06*

**Context.** The Markdown docs live in the repository root, but hosts build only `diskarte/`. A
public Help Center needed search, navigation and diagrams without new infrastructure or a heavier
signed-in app.
**Decision.** `scripts/build-docs-site.mts` renders the pages listed in `docs/site.json` to HTML and a
search index, committed inside the app (like the generated database reference) and served at `/docs`
by the existing Next.js app. Pages are Server Components that inject the pre-rendered HTML; only
search, copy buttons, the table-of-contents highlight and Mermaid (lazy, only on pages with
diagrams) run in the browser.
**Alternatives considered.** Fumadocs/Nextra (a second app or MDX pipeline, a separate deploy and a
styling system to reconcile); rendering Markdown per request (ships a parser and highlighter to the
server for every view); an external search service (cost, and private pages could leak into it).
**Consequences.** No new deployment; the docs inherit the app's themes, CSP and fonts. Authors run
`npm run docs:site` after editing published Markdown (the docs test fails otherwise). Publication is an
explicit allow-list, so new runbooks stay off the site by default.

## 014. Release announcements published by the deployment itself

**Status.** Accepted — *2026-11-07*

**Context.** Each meaningful release should be announced in Diskarte HQ, but only once it is
actually live: not on push, not for failed or preview builds. There is no GitHub CLI or repository
secret available to wire a CI step, and pushes to `main` deploy on Vercel in parallel with CI.
**Decision.** A production server instance announces its own release from `instrumentation.ts`
`register()` (opt-in `RELEASE_ANNOUNCEMENTS=on`, production only). Notes are developer-written JSON
formatted deterministically. A service-role-only SQL function posts once per release under an
advisory lock and refuses older releases after newer ones.
**Alternatives considered.** A GitHub Actions job on Vercel's `deployment_status` (needs a repository
secret and an exposed publish endpoint); a Vercel deployment webhook (plan-dependent, another secret);
publishing from CI on merge (would announce failed deployments).
**Consequences.** Every instance start costs one cheap RPC (not awaited). If the first attempt fails,
the next instance retries. Super admins can retry, withdraw or republish in the Control Center.


## 015. Hangouts are temporary group conversations

**Status.** Accepted — *2026-11-08*

**Context.** Friends needed a spontaneous way to talk and call without creating a permanent
Tambayan, and without leaving abandoned rooms or files behind.
**Decision.** A Hangout is a `dm_conversations` group row with an end time (`hangout_until`). It
reuses group-DM text, read state, Realtime, the DM call room and rings unchanged. Expired hangouts
stop accepting messages immediately (trigger) and are deleted by `purge_expired_hangouts` (platform
job, and whenever a hangout is created). Uploads are refused while temporary so deletion never
orphans Storage objects; "Keep" clears the end time.
**Alternatives considered.** A new `hangouts` table with its own messages and LiveKit rooms
(duplicates DMs, calls and their RLS); temporary Tambayans (channels, roles and invites are far more
than a quick get-together needs, and cleanup would touch many tables).
**Consequences.** Every DM code path already handles hangouts; the UI only adds the end-time bar,
list badges and the start dialog. Hangouts follow group-DM rules (friends only, ≤ 10 people). Files
need the hangout to be kept first.

## 016. Pulse ships behind a per-browser shell preference

**Status.** Accepted — *2026-11-08*

**Context.** The Diskarte Pulse redesign (Spaces navigator, Conversation Canvas, Context sheet) replaces
the whole look. It has to be built and tested in production-like conditions over several releases
while Classic, the current UI, stays exactly as it is for everyone else.
**Decision.** A `diskarte-shell` cookie (`classic` by default, or `pulse`) is read by the root layout,
which server-renders `<html data-shell>` like the theme and colour mode. Every Pulse style is scoped
to `html[data-shell="pulse"]` ([`pulse.css`](../../diskarte/src/app/pulse.css)) and Pulse components
live in `components/pulse/`, lint-restricted to Pulse tokens. Switching sets the attribute, writes the
cookie and calls `router.refresh()` ([`lib/shell.ts`](../../diskarte/src/lib/shell.ts)), never a full
reload, so the call and session providers in the `(app)` layout stay mounted.
**Alternatives considered.** A separate route tree or app (duplicates data loading and would drop
the call when switching); a server-side flag per account (needs a migration and makes a stuck user
unable to switch back in another browser); a `localStorage` flag (the server can't see it, so the
first paint would flash the wrong shell).
**Consequences.** Classic needs no changes and its tests prove it is untouched. Pulse fonts load only
when Pulse styles use them. Until there is a visible switch, Pulse is reached by setting the cookie.
The preference is per browser, like the theme; syncing it across devices would be a later decision.
