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

Current full backend E2E journeys use Classic selectors and do not opt into Pulse. Their success
alone cannot certify both-mode acceptance. Run backend tests only against isolated services: several
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
E2E_PORT=3997 npx playwright test --retries=0
```

Build before browser verification. The experience suite runs real components with fixture data in
Chromium. Local E2E serves the standalone production build; full journeys require isolated Supabase
and LiveKit with `E2E_FULL=1`. Record skips, failures and unhandled rejections; never turn skipped
journeys into passes. Do not increase retries to hide failures.

## Acceptance record

Final integrated test totals, lint, typecheck, build and documentation checks: pending.
Full backend Classic/Pulse acceptance, physical devices, Safari/Firefox and manual screen readers:
pending. Production rollout flag, CI, deployment and community announcement: not verified by this
local preparation. The 15-journey gate is not passed while these required checks remain open.

## Release and announcement gate

Keep the separate privacy-hardening release unpushed until its explicit approval. Review any
production migration separately. Before enabling public opt-in, review the remaining acceptance
gaps, verify CI and the deployed app, and then authorize the deployment's rollout configuration.

The [pending release note](../../diskarte/RELEASE-PULSE.md) contains developer-written announcement
copy and real Help Center links. It is not yet registered in `src/content/releases.json`, because the
production publisher would otherwise make it eligible before deployment verification. Register and
publish it through the existing release workflow only after the production release is verified;
confirm the post actually exists before reporting it published.
