# Troubleshooting and FAQ

Start with three checks: `GET /api/health?deep=1`, Settings → Advanced → **Connection diagnostics**
in the affected browser, and `npm run db:check --prefix diskarte` against the project the app uses.

## Configuration and deployment

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Missing configuration" notice instead of the app | `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `LIVEKIT_URL` missing or malformed | Check `/api/health` (`"config":"missing"`), fix env vars, redeploy |
| `/api/health?deep=1` returns 503 with `"supabase":"unreachable"` | Supabase paused (free tier pauses after a week idle) or wrong URL | Resume the project in the dashboard; verify `SUPABASE_URL` |
| Every page returns 500 after a deploy | SSR crash, often browser-only code in the root layout | Roll back; reproduce with `npm run build && node .next/standalone/server.js` |
| Pages redirect to another domain | `SITE_URL` differs from the host you opened (proxy 308) | Set `SITE_URL` to the canonical origin |
| API POSTs return `403 Cross-site request blocked` | Request `Origin` isn't `SITE_URL`; reverse proxy not forwarding host/proto; local run on a non-default port | Set `SITE_URL` to the exact origin (including port); forward `X-Forwarded-Host/Proto`; add extra origins to `ALLOWED_ORIGINS` |
| `429 Too many requests` on sign-in | 5 auth POSTs/min per IP | Wait (`Retry-After`); raise `RATE_LIMIT_AUTH_PER_MINUTE` only for tests |
| New feature shows "unavailable" or a "couldn't" toast | Its migration isn't applied to this project | Apply the pending migrations in order ([release notes](../../diskarte/CHANGELOG.md)); rerun `db:check` |
| Control Center: "The Control Center couldn't load" | Admin migration missing, or not a super admin | Apply migrations; grant with `npm run admin:grant` |

## Sign-in

| Symptom | Fix |
| --- | --- |
| OAuth returns to `/login?error=…` | Add `<SITE_URL>/auth/callback` to Supabase redirect URLs; the provider's callback must be `https://<ref>.supabase.co/auth/v1/callback` |
| OAuth button missing | Provider not in `AUTH_OAUTH_PROVIDERS` (unset means GitHub + Google; empty means none) |
| Confirmation email link "invalid or expired" | Link already used or expired; for custom templates use `/auth/confirm?token_hash=…&type=email` |
| Stuck on `/mfa` | The account has a verified TOTP factor; enter a current code. Lost authenticator: a project admin must remove the factor in Supabase Auth |
| Bounced to `/reset-password?first=1` | Account has a temporary password (`must_change_password`); set a new one |
| "Your session ended" | Session revoked, account banned or deleted; sign in again |
| Sign-up says registrations are paused | `SIGNUP_MODE=invite` |

## Messaging and realtime

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Messages only appear after reload (production only) | A public Realtime channel (refused when "Allow public access" is off), or a topic missing from `can_access_realtime_topic()` | Use `subscribeDbChanges()` / `private: true`; add the topic rule in a migration |
| Presence/typing never shows | `realtime.messages` policies missing | Re-apply migrations on a fresh project; check diagnostics for `error` joins |
| Messages stay "queued" | Offline, or the retry keeps failing | Reconnect and open the conversation; use Retry. Ids are stable, so retries don't duplicate. Don't replay with new ids |
| "Slow mode — you can send again in Ns" | Channel slow mode | Wait; moderators are exempt |
| Message silently disappears after sending | Auto-mod dropped it | Moderators see `automod.block` entries in the audit log |
| "Accept this server's rules first" | Server rules changed or never accepted | Open the rules card above the composer |
| Chat looks stale after reconnecting | Recovery failed | Use **Retry sync** in the chat; check membership and session |
| Unread badges come back on another device | Older database without `…_notification_read_state` | Apply the migration |

## Voice and video

| Symptom | Fix |
| --- | --- |
| "Voice is not configured on this server" | Set `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` and redeploy |
| "You're timed out in this server" | A moderator timeout is active |
| Can't join: browser blocks mic/camera | Media needs HTTPS or `localhost`; check site permissions |
| No sound after a page reload mid-call | Autoplay blocked: click the **turn on sound** button |
| Call dropped after navigation | A deploy forced a full reload; the call rejoins within 30 s |
| Voice previews show people who left | LiveKit webhook not configured (needs `SUPABASE_SERVICE_ROLE_KEY` and the webhook URL); refresh the preview |
| Can't move someone to a channel | Moving into private voice channels isn't supported |

## Notifications and PWA

| Symptom | Fix |
| --- | --- |
| "Server push is not configured" | All five push variables must be valid and the push migration applied ([web-push.md](../../diskarte/docs/web-push.md)) |
| `PUSH_WAKE_NOT_CONFIGURED` | Vault secrets `diskarte_push_url` / `diskarte_push_secret` missing or invalid; fix and rerun the installer |
| Dispatcher returns 401 to wakes | Vault secret differs from `PUSH_DISPATCH_SECRET` |
| No notifications on iPhone | Install to the Home Screen first (iOS 16.4+), then enable from Settings |
| Notifications stopped | Check browser permission, quiet hours, the one-hour pause, server/channel mutes |
| App looks outdated | Settings → Storage & Data → apply the pending update (finish calls first); "Clear downloaded app files" keeps drafts and queued messages |

## Local development

| Symptom | Fix |
| --- | --- |
| Port 3000 is busy | `npm run dev -- -p 3001` and set `SITE_URL=http://localhost:3001` |
| E2E tests test old code | Playwright serves the last standalone build: run `npm run build` first |
| Smoke E2E fails on CSRF/rate limits | Export the CI-like env: `SITE_URL` matching `E2E_PORT`, and unset a low `RATE_LIMIT_AUTH_PER_MINUTE` |
| `supabase start` fails | It needs Docker; use a hosted dev project otherwise |
| `npx playwright` at the root fetches a different version | Run Playwright from `diskarte/` (it's only installed there) |
| Lint chokes on a stray `.next` folder in another directory | Delete the stray build output |
| A formatter rewrote whole files | The repo has no Prettier config and is hand-formatted (~160-column lines); don't run Prettier on it |
| `next dev` changed `diskarte/AGENTS.md` | `next dev` re-adds its agent notice block; commit it with your work or leave it |

## FAQ

**Is Diskarte a Discord clone?** It's an independent, open-source community chat app with a familiar
shape (servers, channels, voice) built for Filipino communities. It shares no code or assets with
Discord.

**Can I self-host it?** Yes: the Docker image plus your own Supabase and LiveKit projects (or
self-hosted Supabase/LiveKit). See [deployment.md](deployment.md).

**Are messages end-to-end encrypted?** No. Messages are protected by TLS in transit and by RLS in the
database; voice/video is encrypted hop-by-hop between each client and the LiveKit SFU.

**Does the app need the Supabase service-role key?** Only for optional server features (LiveKit
webhook, push dispatcher) and the admin-grant script. Core chat and voice don't.

**Why did my scheduled message not send?** It runs as you, under the same rules as a live send; the
reason (timed out, slow mode, lost access, auto-mod) is shown in the scheduled list. Without the
platform cron job it only sends while you have Diskarte open.

**Why can't I message someone?** 1:1 DMs need an accepted friendship and no block either way. Their
privacy setting may also refuse friend requests.

**Where do I report a security issue?** Privately, via GitHub security advisories — see
[SECURITY.md](../../SECURITY.md).
