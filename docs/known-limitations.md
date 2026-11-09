# Known limitations and documentation gaps

An honest list of what Diskarte doesn't do, what hasn't been verified, and what this documentation
couldn't confirm. Keep it current: remove items when they're fixed, add them when found.

## Product limitations

| Area | Limitation |
| --- | --- |
| Offline | Only an offline page and queued sends; conversations aren't readable offline |
| Messaging | No message reporting inside Tambayans, translation, or scheduling in DMs; scheduled messages are text-only |
| Search | `simple` text configuration — no stemming or language-aware matching |
| DMs | Friends-only; no read-receipt or typing opt-out; group DMs have no roles or icons |
| Hangouts | No shared notes/boards inside a hangout, no files while temporary; expired ones are deleted by the next purge (platform job or the next hangout anyone starts), but already stop accepting messages |
| Reminders | Server messages only; shown while the app is open (no push) |
| Forums | No post subscriptions or notifications for followed posts |
| Moments | Photos of purged moments stay in Storage until the author deletes their account |
| Communities | Custom roles grant only private-channel access; no outgoing webhooks, bot accounts, OAuth apps, interactive commands or general automation builder |
| Workspace | No real-time co-editing, cursors, comments, history or export |
| Voice/video | No recording, transcription, stage mode or E2E encryption; can't move members into private voice channels; push call alerts aren't native telephony |
| Accounts | No passkeys, SMS 2FA, recovery codes or in-app email change |
| Localization | Filipino covers core navigation, settings, the Home onboarding panels and in-app help links; most screens, notifications and the Help Center are English |
| Preferences | Most display/voice/notification preferences are per browser, as are the Getting started dismissal and the What's New "seen" marker |
| Moderation | Rule-based auto-mod only; no ban appeals; audit logs kept indefinitely |
| Native apps | None; the PWA is the mobile app |

## Operational limitations

| Area | Limitation |
| --- | --- |
| Rate limits | In-memory per instance unless Upstash is configured; Server Action and route-level limits (messages, voice tokens, previews) are always per instance |
| Link previews | Cache is per instance (1 hour, 500 entries) |
| Free tiers | Render sleeps after ~15 min idle; Supabase pauses after a week idle |
| Background jobs | Recurring announcements, the moments purge, the hangout purge (also run on demand) and offline status clearing need the `pg_cron` platform job |
| Migrations | Applied manually; no automated drift detection beyond `npm run db:check` |
| Monitoring | No alerting or uptime monitoring configured in the repository |
| Staging | No staging environment defined in the repository |

## Not verified

These were not verified by automated tests or during the writing of this documentation:

- **Physical devices**: iOS/Android behaviour (keyboard, background audio, Bluetooth, battery
  policies, installed-PWA quirks) — all browser testing is Chromium emulation.
- **Safari and Firefox**: no automated browser runs.
- **Web Push in production**: VAPID/Vault configuration on the production project and delivery
  through Apple/Google/Mozilla push services.
- **LiveKit webhook in production**: whether the production LiveKit project posts to
  `/api/livekit/webhook`.
- **Platform cron job state**: whether `enable-platform-jobs.sql` is installed on the production
  project was not checked while writing these docs (`select jobname, active from cron.job;`).
- **Backups**: no restore drill has been recorded.
- **Accessibility**: axe-core automated checks only; no manual screen-reader audit.
- **Performance**: no load testing; bundle and LCP numbers are one-off local measurements.

## Documentation gaps

- **Database function descriptions** in the generated reference come from SQL comments; many
  functions have none. The hand-written [database guide](database.md) covers the important ones; add
  comments above `create function` in future migrations to fill the rest.
- **Historical docs** (`diskarte/DEPLOYMENT.md`, `diskarte/OPERATIONS.md`, release notes) are kept for
  history and now point here; where they disagree with these docs, the code and these docs win. They
  still describe Render as the primary host and (in OPERATIONS.md) push as "not enabled in this
  release", which was true for October 14.
- **No license file.** The README calls Diskarte open source, but the repository has no `LICENSE`
  file; only the Knewave font's OFL licence is included. The maintainers should choose and add one.
- The `problem_reports` migration header mentions a `.github/workflows/fix-agent.yml` "autofix"
  workflow; that workflow and the automated report action were removed (manual triage only).
- The Help Center has no interactive API console (copyable `curl` examples only), no per-version
  docs (it documents `main`), and no "was this helpful" counter — feedback is free text into the
  existing report queue or a GitHub issue.
- Help Center screenshots come from the fixture harness and the production build with sample data;
  they are not captured on physical phones and show only English UI.
