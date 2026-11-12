# Account, settings and app

Settings open as a dialog over the app (so calls keep running); `/settings/profile` and
`/settings/account` exist as direct links. **Code:** [`SettingsDialog`](../../diskarte/src/components/profile/SettingsDialog.tsx),
[`SettingsPanels`](../../diskarte/src/components/profile/SettingsPanels.tsx) (lazy-loaded).

| Section | Contents | Stored |
| --- | --- | --- |
| My Profile | Avatar, banner, display name, bio, status ([`ProfileBuilder`](../../diskarte/src/components/profile/ProfileBuilder.tsx)) | `profiles` |
| My Account | Email, sign-in providers, change password, two-factor, sign out, danger zone (delete account) | Supabase Auth, `profiles` |
| Devices & Sessions | This device, sign out of this device or everywhere | Supabase Auth |
| Privacy & Safety | Who can send friend requests | `privacy_settings` |
| Appearance | Theme (Solar, Bayan, Neon, Ube, Sampaguita, Kalikasan) and colour mode (dark, light, system) | Cookies (`diskarte-theme`, `diskarte-mode`) — rendered on the server, no flash |
| Accessibility | Chat font size (12–20 px), reduced motion (system/on), role colours in names, always underline links, reduce transparency, increase contrast | This browser |
| Voice & Video | Input/output devices, input profile (Isolation, Studio, Custom: noise suppression, echo cancellation, auto gain), push to talk, Mic Test | This browser |
| Chat | Display images and videos, link previews, reactions, show spoiler content, 24-hour time | This browser |
| Notifications | Desktop alerts, DM alerts, quiet hours, one-hour pause, sounds; Web Push for this device (categories, previews) | This browser + `account_state` when push is on |
| Advanced | Connection diagnostics (session-only Realtime/call/message events) | Memory |
| Language & Region | English or Filipino (core navigation and settings strings), time zone | Cookie `diskarte-language`, this browser |
| Storage & Data | Low-data mode, **Request all of my data**, install/update the app, clear downloaded app files | This browser / export RPC |
| Keybinds | Ctrl/Cmd+K go anywhere, Ctrl/Cmd+Shift+H home, Ctrl/Cmd+Shift+M messages, Enter send, Shift+Enter new line, Escape close | — |
| Report a problem | Problem report form | `problem_reports` |

Per-server notification level (@mentions only / nothing) and server mute live in each server's menu;
channel mutes in the channel's menu.

## Classic and Pulse

Classic remains the default. When the operator opens public opt-in, **Settings → Appearance → Try
the new Diskarte** switches to Pulse in this browser. **You → Back to Classic** or the same switch
returns to Classic. Without public opt-in, the switch is a super-admin preview. The preference is
the `diskarte-shell` cookie, separate from account data and notification preferences.

Switching refreshes the app in place and keeps the active call and current conversation mounted.
It must preserve drafts, pending uploads, reply/thread context and unsaved message edits. Permissions
continue through the same server guards, Supabase RLS and LiveKit tokens. See the
[Pulse user guide](../user-guide/pulse.md) and [rollout gate](../design/pulse-rollout.md).

## Account security

- **Password**: change in My Account (accounts that sign in with email), with the live policy
  checklist. Recovery via "Forgot password".
- **Two-factor (TOTP)**: enrol with any authenticator app; once on, new sessions must enter a code at
  `/mfa`, and the database refuses unverified sessions. See [security.md](../security.md#two-factor-authentication-totp).
- **Sign out everywhere** revokes every refresh token.

## Data export

Storage & Data → **Request all of my data** downloads one JSON document (`export_my_data`) with your
profile, Tambayans, messages, DMs, reactions, friends, blocks, notes, nicknames, favourites, saved
messages, poll votes, RSVPs, warnings received, LFG posts, problem reports, scheduled messages,
moments, XP and settings. Other people's content beyond who you're connected to isn't included.
Tests: `tests/db/export.test.ts`, `tests/db/account-data-coverage.test.ts`.

## Account deletion

My Account → **Danger zone** → type your username. Your uploaded files are deleted first, then the
account: Tambayans you own pass to their highest-ranked, longest-standing member (or are deleted if
you're alone), your messages with attachments are deleted, other messages remain without an author,
and private data is removed. Requires a completed two-factor session if 2FA is on. Irreversible.
Tests: `tests/db/account.test.ts`, `tests/account/delete-account.test.ts`.

## Low-data mode

Smaller and lower-quality images (quality 40), GIFs don't autoplay, videos don't preload, cameras
capture at 360p, screen shares at 720p/5 fps, and remote video uses low simulcast layers. Defaults to
the browser's Save-Data hint until you choose. [`lib/low-data.ts`](../../diskarte/src/lib/low-data.ts).

## Installable app (PWA)

Install from the browser menu (Android/desktop) or **Share → Add to Home Screen** (iOS). The installed
app opens at `/tambayan`, has Messages and Explore shortcuts, follows your colour mode in the status
bar, and supports Web Push (iOS 16.4+ only when installed). Offline you get an offline page and your
unsent messages queue; past conversations aren't available offline. See
[notifications-and-pwa.md](../architecture/notifications-and-pwa.md).

## Sound effects

All cues are synthesized 8-bit sounds (no audio files): join, leave, mute, unmute, deafen, message,
mention, send, error, start, ring. Settings → Notifications → sounds, or the speaker button in the
user panel, sets the master volume.

## Tests

`tests/ui/SettingsDialog.test.tsx`, `tests/ui/two-factor.test.tsx`, `tests/db/mfa.test.ts`,
`tests/db/account-state.test.ts`, `src/hooks/__tests__/account-sync.test.tsx`,
`src/lib/__tests__/display-prefs.test.ts`, `src/lib/__tests__/locale.test.ts`, `e2e/appearance.spec.ts`,
`e2e/pwa.spec.ts`.

## Known limitations

- Most preferences are per browser and don't follow you to another device (drafts and notification
  preferences do).
- Filipino covers core navigation and settings only; most UI text is English.
- No passkeys/WebAuthn, SMS 2FA or recovery codes; losing the authenticator needs an admin.
- No in-app email change.
