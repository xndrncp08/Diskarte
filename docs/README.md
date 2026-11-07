# Diskarte documentation

Everything about Diskarte — what it does, how it works, how to run it and how to change it. The
source code is the authority; these pages describe `main` as of November 2026 and say so where
something is unverified.

## Start here

| I want to… | Read |
| --- | --- |
| Understand what Diskarte is | [Introduction](getting-started/introduction.md) |
| Run it on my machine | [Quick start](getting-started/quick-start.md) |
| Use it (no technical background) | [User guide](user-guide/README.md) |
| Deploy or operate it | [Deployment and operations](operations/deployment.md) · [Troubleshooting & FAQ](operations/troubleshooting.md) |
| Change the code | [Contributing](contributing/README.md) · [Architecture overview](architecture/overview.md) |
| Report a vulnerability | [SECURITY.md](../SECURITY.md) |

## Map

**Getting started**
- [Introduction](getting-started/introduction.md) — product overview, vocabulary, principles
- [Quick start](getting-started/quick-start.md) — requirements, setup, first run, common issues

**Architecture**
- [Overview](architecture/overview.md) — system diagram, stack, repository layout, request lifecycle, frontend/backend, data flow
- [Realtime and message delivery](architecture/realtime.md) — topics, authorization, optimistic updates, offline queue, idempotency, recovery, read receipts, presence
- [Voice, video and screen sharing](architecture/voice-and-video.md) — LiveKit tokens, call lifecycle, recovery, rings, moderation, previews
- [Background processing](architecture/background-jobs.md) — the platform tick, push outbox, cron jobs
- [Notifications, service worker and PWA](architecture/notifications-and-pwa.md)
- [Architecture decision records](architecture/decisions.md)

**Features** — [catalogue with status](features/README.md)
- [Messaging](features/messaging.md) · [Friends, DMs and profiles](features/social.md) · [Tambayans](features/communities.md)
- [Moderation and administration](features/moderation.md) · [Voice and video](features/voice-and-video.md)
- [Shared workspace](features/workspace.md) · [Account, settings and app](features/account-and-settings.md)

**Data and APIs**
- [Database guide](database.md) — domains, ER diagrams, permission model, storage, retention, deletion
- [Database reference](reference/database.md) — *generated*: every table, column, policy, trigger and function
- [API reference](reference/api.md) — HTTP endpoints, Server Actions, RPCs, error codes, rate limits
- [Environment variables](reference/environment.md)

**Security and quality**
- [Authentication and security](security.md) · [SECURITY.md](../SECURITY.md) (threat model, reporting)
- [Testing](testing.md)
- [UI, UX and design system](design-system.md)

**Operations**
- [Deployment and operations](operations/deployment.md) — Supabase, LiveKit, Vercel, Docker/Render, releases, health, backups, rollback, incidents
- [Troubleshooting and FAQ](operations/troubleshooting.md)
- Feature runbooks: [Web Push](../diskarte/docs/web-push.md) · [Voice previews](../diskarte/docs/voice-preview.md) · [Platform experience notes](../diskarte/docs/platform-experience.md)

**User guide** — [index](user-guide/README.md)

**Contributing**
- [Contributing guide](contributing/README.md) — workflow, conventions, PRs, docs checklist
- [Database migrations and RLS review](contributing/database-migrations.md)
- Templates: [feature doc](contributing/templates/feature.md) · [ADR](contributing/templates/adr.md)

**Status**
- [Known limitations and documentation gaps](known-limitations.md)
- [Changelog](../diskarte/CHANGELOG.md) and release notes: [2026-10-29](../diskarte/RELEASE-2026-10-29.md),
  [2026-10-15](../diskarte/RELEASE-2026-10-15.md), [2026-10-14](../diskarte/RELEASE-2026-10-14.md),
  [2026-10-14 follow-up](../diskarte/RELEASE-2026-10-14-remaining.md)

## The Help Center website

Published pages are served by the app itself at **`/docs`** (public, no sign-in), with search,
navigation, rendered diagrams, screenshots and in-app help links. Which pages are published is decided
in [`site.json`](site.json); see [contributing → The Help Center](contributing/README.md#the-help-center-docs).

## Keeping these docs accurate

- `npm test --prefix diskarte` runs [`tests/docs/docs.test.ts`](../diskarte/tests/docs/docs.test.ts):
  it fails on broken relative links and anchors, a stale generated database reference, and
  environment variables the code reads but [environment.md](reference/environment.md) doesn't list.
- After a migration: `npm run docs:db --prefix diskarte`.
- Every PR follows the [docs checklist](contributing/README.md#documentation).
- Diagrams are Mermaid, which GitHub and the Help Center both render.
