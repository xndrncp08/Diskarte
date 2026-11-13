# Diskarte handoff — 2026-11-13 (Pulse public opt-in: SHIPPED)

## State

- `main` = `origin/main`; prod on Vercel auto-deploys main. Diskarte Supabase `vyxqudcxlfsdjyugjwhb`
  (Free plan, no backups/PITR; schema == repo since 2026-11-12). Never touch `Resoniq`.
- **Pulse is live as a public opt-in** (`DISKARTE_PULSE_ROLLOUT=opt-in`, Vercel Production env
  `SKMkwtK2p9W4kG5G`). Classic is the default. **Kill switch:** delete/unset that env var and
  redeploy; clients fall back to Classic on next refresh/navigation.
- Release `2026-11-13-pulse` registered in `src/content/releases.json` and **published** to HQ
  #announcements via `publish_release_announcement` (row + message confirmed). `RELEASE_ANNOUNCEMENTS`
  is still unset on Vercel, so future releases are not auto-posted; set it to `on` (Production) to
  enable, or publish by hand the same way (see `docs/sql/` pattern in git history of this file).

## What was done (2026-11-13)

1. `e2e/pulse.spec.ts` (CI runs the E2E server with `DISKARTE_PULSE_ROLLOUT=opt-in`): Classic
   default, opt-in persists across reload, Pulse-only routes gated per user, real-time chat Pulse↔
   Classic, mention badge in Pulse rooms, LiveKit join/mute kept while browsing and across Back to
   Classic, phone Back + tab bar, skip link. Passed in CI (`2e52218`, run 43382374483) with the 82
   Classic checks. Lesson: rooms fill a phone screen, so the tab bar only shows on top-level screens.
2. Docs: changelog dated, `RELEASE-PULSE.md`, `docs/design/pulse-rollout.md` (acceptance record),
   features README, Help Center regenerated (`npm run docs:site`).
3. Production smoke (owner's signed-in Chrome session + curl): `pulseOptIn:true` in runtime config;
   no cookie → Classic; Pulse cookie unauthenticated → `/tambayan/spaces|you` 307 to login (login
   page itself renders the chosen shell — presentation only); Settings → Appearance switch →
   Pulse; persisted after reload; `/tambayan/spaces`, HQ landing, #announcements (messages load,
   composer, context toggle); You → Back to Classic → Classic, persisted after reload.
4. CI on `5650532` failed at "Start Supabase" (infra, before any test); re-run via this commit.

## Not verified (recorded limitations)

Physical iOS/Android, installed PWA, Safari/Firefox, manual screen readers, the original 15-journey
definitions. Chrome extension dropped twice and showed the SW offline page on hard navigations
(local connectivity; `public/sw.js` only serves it when `fetch` rejects) — not an app bug.

## Follow-ups

- Supabase advisors (pre-existing): 20 anon-executable SECURITY DEFINER fns, leaked-password
  protection off, one RLS-no-policy INFO. Free plan → take `pg_dump` backups.
- Optional `feat/community-identity` (`f4e28fa`) still separate.
