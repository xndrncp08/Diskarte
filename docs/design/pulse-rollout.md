# Pulse rollout and regression gate

Status: local development and acceptance preparation. This document is not evidence of a production
release. The integration target is `feat/pulse`; `main`, deployment settings and production data
remain behind their existing release gates.

## Opt-in and rollback

- Classic is the default when `diskarte-shell` is absent or has any value other than `pulse`.
- `DISKARTE_PULSE_ROLLOUT=opt-in` enables the public **Try the new Diskarte** switch in
  **Settings → Appearance**. The server supplies this eligibility; a browser preference cannot
  enable public rollout by itself.
- With the flag absent or set to another value, the existing super-admin preview remains. Ordinary
  members render Classic even if they set the cookie themselves.
- The same server decision applies to the document shell, app frame, Space overview and Pulse-only
  Spaces/You routes. The shell preference is presentation, not an authorization grant.
- Switching updates the cookie and refreshes Server Components in place. The session providers,
  call, unread state and conversation content must retain their identity. Uploaded draft attachments,
  reply/thread context and unsaved edits are part of this contract.
- Users return through the switch or **You → Back to Classic**. Operational rollback removes the
  rollout flag and redeploys; already open clients pick up server eligibility on their next refresh
  or navigation. Clearing the shell cookie returns one browser to Classic.

No Step 6/7 database migration is needed. The optional community identity migration remains on the
separate `feat/community-identity` branch; the Pulse UI tolerates its missing fields. See the
[release notes](../../diskarte/RELEASE-PULSE.md). Never apply production migrations automatically.

## Recovered work and review scope

The takeover found Steps 1–5 integrated at `80f1bb2`, voice isolated on `feat/pulse-voice`, and mobile
isolated on `feat/pulse-mobile` with uncommitted review follow-ups. The root checkout remained
`release/privacy-hardening` at `0801281`. These are recovery references, not final validation results.
Historical test totals from the interrupted work are not reused as current evidence.

Review covers shared long-press cancellation, deterministic Back navigation, installed-app edge
gestures, short landscape screens, keyboard and safe-area layout, call control availability and
Classic/Pulse switching. Data review preserves Invisible presence, private voice-room visibility,
audit-log privacy, membership guards, message authorization and account isolation. Pulse keeps the
existing RLS-scoped queries and LiveKit token path.

## The 15-journey definition gap

The handoff calls for 15 previously approved regression journeys. Their original definitions could
not be recovered from repository docs, local worktree design notes or relevant commit summaries.
The following matrix is **reconstructed from the handoff and existing tests**, not represented as
that missing approval. Every journey needs explicit Classic and Pulse acceptance before declaring
the rollout gate passed. Fixture and unit coverage supports a journey; it does not establish live
backend, physical-device or production acceptance.

| # | Journey and acceptance | Existing evidence sources | Remaining acceptance |
| --- | --- | --- | --- |
| 1 | Sign up, onboard, sign out and sign back in; protected routes stay protected | `e2e/auth-profile.spec.ts`, `e2e/public-auth.spec.ts`, auth security tests | Both shells against isolated Supabase |
| 2 | Edit profile/settings; retain account and appearance preferences | `e2e/auth-profile.spec.ts`, settings UI and account-state tests | Both shells with real saved state |
| 3 | Create/join/invite/leave a Space; preserve membership restrictions | `e2e/server-chat.spec.ts`, community and private-channel DB tests | Both shells, member and outsider |
| 4 | Send/reply/react/edit/pin/delete; retain drafts and pending uploads on shell switch | `e2e/server-chat.spec.ts`, Pulse messaging and switching UI tests | Both shells with realtime and uploads |
| 5 | Friends, direct/group messages and Hangouts; deep links stay scoped | `e2e/community.spec.ts`, hangout/social tests | Both shells, two accounts |
| 6 | Threads, forums, tags, polls and message actions remain usable | `e2e/community.spec.ts`, Pulse messaging browser tests, forum/poll tests | Both shells with persistence |
| 7 | Private rooms, Invisible presence and moderation/audit privacy remain protected | security/private-channel/privacy DB tests, Pulse shell/voice UI tests | Both shells with disallowed accounts |
| 8 | Join/mute/deafen/video/share/leave; browse and switch shells without reconnecting | `e2e/voice.spec.ts`, Pulse voice browser/UI tests | Isolated LiveKit, real devices and background/resume |
| 9 | Notifications, mentions and read state survive navigation and switching | `e2e/notifications.spec.ts`, unreads/notification tests | Both shells with realtime and push configured |
| 10 | Draft/account sync recovers offline conflicts without leaking another account's data | `e2e/sync-workspace.spec.ts`, account-sync/draft tests | Both shells across isolated sessions |
| 11 | Shared resources, notes and boards preserve permission/conflict behaviour | `e2e/sync-workspace.spec.ts`, workspace DB/UI tests | Both shells with two editors |
| 12 | Home/People/Spaces/You, room/DM Back, deep links, sheets, keyboard and landscape | Pulse mobile browser/UI tests, shared gesture/menu tests | Physical iOS/Android and installed PWA |
| 13 | Keyboard, focus, accessible names, contrast, reduced motion and touch targets | Pulse fixture browser axe checks, `e2e/a11y.spec.ts`, `e2e/appearance.spec.ts` | Manual screen readers and browser/device coverage |
| 14 | Install, offline queue, foreground recovery and private notification handling | `e2e/pwa.spec.ts`, service-worker/push/session tests | Installed devices and actual push services |
| 15 | Eligible users opt in/out, Classic stays default, rollback preserves calls/data/navigation | shell gate/opt-in/persistence tests | Actual Next.js refresh flow in both rollout states |

`e2e/pulse.spec.ts` runs the Pulse half of journeys 4, 5, 8, 9, 12, 13 and 15 against isolated
Supabase and LiveKit with the server in the public opt-in state (CI sets `DISKARTE_PULSE_ROLLOUT`);
its second account stays on Classic, so it also checks interoperability. The remaining journeys run
in Classic only. Run backend tests only against isolated services: several
journeys create and delete accounts or community data.

## Verification procedure

Run from the repository root; use the app's own dependencies and lockfile:

```sh
npm run docs:site --prefix diskarte
npm test --prefix diskarte
npm run lint --prefix diskarte
npm run typecheck --prefix diskarte
npm run build --prefix diskarte
cd diskarte
npx playwright test --config playwright.experience.config.ts --retries=0
E2E_PORT=43127 npx playwright test --retries=0
```

Build before browser verification. The experience suite runs real components with fixture data in
Chromium. Local E2E serves the standalone production build; full journeys require isolated Supabase
and LiveKit with `E2E_FULL=1`. Record skips, failures and unhandled rejections; never turn skipped
journeys into passes. Do not increase retries to hide failures.

## Acceptance record

Verified locally on 2026-11-11:

| Check | Result | Evidence and limits |
| --- | --- | --- |
| Vitest | 1,160 passed, 191 files | Includes PGlite privacy/RLS, LiveKit token, presence, menu cancellation, navigation, call recovery and shell-state regression tests |
| Experience browsers | 65 passed in the full run; 2 focused follow-ups passed | 67 distinct passing checks in total: the added landscape inertness check and opt-in preservation check both passed. Three optional docs screenshot jobs skipped; retries disabled |
| Production standalone E2E | 56 passed, 28 skipped | Fresh local server on port 43127, `E2E_FULL=0`, dummy local Supabase/LiveKit endpoints, announcements disabled; retries disabled |
| Lint / TypeScript / production build | Passed | Local Next.js build, not a hosted deployment |
| Help Center | Regenerated; documentation/release checks passed | Generated content, links, anchors, environment reference, internal-page exclusion and release manifest validation |

An initial standalone attempt reused a server that had been running for almost three days on port
3997. Its asset/hydration/accessibility failures were not evidence about this checkout. The run was
stopped, that unrelated server was left untouched, and the successful run used a fresh port with
reuse disabled. Production E2E now refuses occupied ports rather than silently checking old assets.

The experience tests exercise real components in Chromium against fixtures, including dark/light
modes, five emulated phone sizes and short landscape, WCAG axe checks, touch targets, focus, safe
areas and keyboard handling. The opt-in browser test keeps typed text, an uploaded attachment,
mute state, appearance and route across Classic → Pulse → Classic. Unit tests additionally assert
conversation node identity, unchanged call/shared-provider mounts and unsaved inline edit text.
Actual Next.js authenticated refresh and real LiveKit transport remain backend acceptance work.

### Backend acceptance and release — 2026-11-13

- CI on `main` (`2e52218`): the Pulse backend journey passed alongside the 82 Classic E2E checks,
  the experience suite, unit tests, lint, typecheck and the Docker build.
- Production database: level with the repository since 2026-11-12 (schema fingerprint match);
  Pulse needs no migration.
- Public opt-in enabled on Vercel Production and smoke-tested; see the handoff for the exact checks.
- **Not verified, recorded as limitations:** physical iOS/Android devices and installed PWAs,
  Safari/Firefox, manual screen readers, and the original definitions of the 15 journeys. The
  phone, keyboard and axe checks are Chromium emulation only.

## Integration and review receipt

- Recovery: root checkout `release/privacy-hardening` at `0801281`; Steps 1–5 already combined on
  `feat/pulse` at `80f1bb2`; messaging at `33b4319` already integrated. Voice and mobile were still
  isolated, with 11 interrupted mobile edits. All original branches and worktrees were retained.
- Voice review: `54875a8` retains the stage and recovery/Leave controls during reconnects, fails
  closed for unknown channel presence, handles audio retry rejection, makes stream menus keyboard
  reachable, switches an active call to System default, and traps/restores focus in fallback share
  fullscreen. It was integrated by `b08a2ba`.
- Mobile review: `f3c0031` finishes shared cancelled-long-press cleanup, history-safe Back, PWA-only
  custom edge gestures, compact landscape, People/Hangout wording and profile/sheet polish. It was
  integrated with voice by `e74c2a3`.
- Combined fixes: `c083c6e` keeps one `AppFrame` and stable conversation slot, preserves pending
  attachments and edits, connects the compact strip without duplicate announcers, bounds DM stages
  to preserve message space, and makes the short-landscape conversation inert behind its drawer.
- Opt-in: `b98740f` adds controlled public eligibility while keeping Classic the default;
  `3d3b5c3` verifies both Pulse-only phone route gates and browser state preservation.
- Security review: membership, private message/room visibility, admin authorization and LiveKit
  token issuance retain their existing server/RLS boundaries. Unknown-room voice presence now
  returns empty. No Step 6/7 migrations or production data operations were introduced.
- Compatibility: Classic retains its rail, layouts and menu skin. Switching preserves the call,
  shared watchers and conversation state. The existing full backend E2E selectors still target
  Classic, so they cannot certify Pulse backend acceptance without adaptation.
- Documentation: public Pulse guide, shell/mobile/voice design notes, architecture decisions,
  environment/testing references, Unreleased changelog and `RELEASE-PULSE.md` are updated. The Help
  Center uses generated content from `npm run docs:site --prefix diskarte`.
- Git/release status: changes are local to `feat/pulse`; `main` and the separate privacy release
  were not pushed or deployed. The privacy release remains nine commits ahead of the fetched
  `origin/main` and still requires its separate push approval. Untracked local policy folders and
  dependency links in other worktrees were preserved.
- CI/deployment: no new remote CI or production deployment was triggered. Public rollout remains
  disabled by default. No production migration was applied. The optional community identity branch
  `feat/community-identity` at `f4e28fa` remains isolated; missing identity fields degrade gracefully.
- Announcement: developer-written copy is prepared in `RELEASE-PULSE.md`; it is unregistered and
  unpublished until deployment and the actual community post can be verified.

## Release and announcement gate

Public opt-in was enabled on 2026-11-13 after the backend journey passed in CI and production was
smoke-tested. Kill switch: unset `DISKARTE_PULSE_ROLLOUT` on Vercel Production and redeploy.

The [pending release note](../../diskarte/RELEASE-PULSE.md) contains developer-written announcement
copy and real Help Center links. It is registered in `src/content/releases.json` as `2026-11-13-pulse`. Publication is recorded
in the handoff once the post in Diskarte HQ #announcements has been confirmed to exist.
