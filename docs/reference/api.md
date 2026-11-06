# API reference

Diskarte exposes three kinds of interface:

1. **HTTP route handlers** under `/api/*` and `/auth/*` — documented below with real request/response
   shapes.
2. **Server Actions** (`"use server"` functions in [`diskarte/src/actions/`](../../diskarte/src/actions))
   — called by React components, not a public API.
3. **Supabase PostgREST / RPC** — the browser and server query tables and call functions as the
   signed-in user; RLS decides what they see. The full function list with signatures and who may call
   each one is in the [database reference](database.md#functions).

There is no public, versioned REST API for third parties. The only endpoint meant for outside
callers is the [incoming channel webhook](#post-apiwebhooksidtoken).

## Conventions

- **Base URL**: `SITE_URL` (production: `https://diskarte-ten.vercel.app`).
- **Authentication**: Supabase session cookies (`sb-*`), set by sign-in. Route handlers call
  `supabase.auth.getUser()`; there are no API keys or bearer tokens for users.
- **CSRF**: [`proxy.ts`](../../diskarte/src/proxy.ts) rejects non-`GET/HEAD/OPTIONS` requests to
  `/api/*` whose `Origin` (or `Referer`) isn't the site's own origin or listed in `ALLOWED_ORIGINS`
  → `403 {"error":"Cross-site request blocked"}`. Exempt: `/api/livekit/webhook`,
  `/api/push/dispatch` and `/api/webhooks/<id>/<token>` (they authenticate with their own secret).
- **CORS**: only the site origin and `ALLOWED_ORIGINS` receive `Access-Control-Allow-*` headers
  (credentials allowed, `GET, POST, OPTIONS`, max-age 600 s).
- **Rate limits** (per client IP unless noted; `429` with `Retry-After`):

  | Scope | Limit | Configurable |
  | --- | --- | --- |
  | Any `/api/*` except health, LiveKit webhook, push dispatch | 120 / min | `RATE_LIMIT_API_PER_MINUTE` |
  | Auth form POSTs (`/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/settings/account`) | 5 / min | `RATE_LIMIT_AUTH_PER_MINUTE` |
  | Auth callbacks (`/auth/callback`, `/auth/confirm`) | 20 / min | `RATE_LIMIT_AUTH_CALLBACK_PER_MINUTE` |
  | Voice tokens | 20 / min per user | — |
  | Link previews and GIF search | 60 / min per user (shared budget) | — |
  | Voice previews | 45 / min per user | — |

  Limits are in-process (per instance) unless `UPSTASH_REDIS_REST_URL`/`TOKEN` are set, which makes
  the proxy-level limits (`api`, `auth`, `authCallback`) shared across instances.
- **Caching**: every authenticated response sends `Cache-Control: no-store` or `private`.
- **Errors**: JSON `{ "error": "<human-readable message>" }`. Messages are written for end users.

## HTTP endpoints

| Method & path | Auth | Purpose |
| --- | --- | --- |
| [`GET/HEAD /api/health`](#get-apihealth) | none | Liveness / readiness |
| [`POST /api/livekit/token`](#post-apilivekittoken) | session | Mint a room token |
| [`POST /api/livekit/webhook`](#post-apilivekitwebhook) | LiveKit signature | Voice preview invalidation |
| [`GET /api/voice-preview`](#get-apivoice-preview) | session | Who is in a server's voice channels |
| [`GET/POST /api/push/subscription`](#get-apipushsubscription) | session | Manage this device's push registration |
| [`POST /api/push/dispatch`](#post-apipushdispatch) | bearer secret | Drain the push outbox |
| [`POST /api/webhooks/<id>/<token>`](#post-apiwebhooksidtoken) | webhook token | Post into a channel |
| [`GET /api/unfurl`](#get-apiunfurl) | session | Link preview metadata |
| [`GET /api/unfurl/image`](#get-apiunfurlimage) | HMAC signature | Proxy a preview image |
| [`GET /api/gifs`](#get-apigifs) | session | GIPHY search |
| [`GET /api/admin/snapshot`](#get-apiadminsnapshot) | super admin | Control Center data |
| [`GET /auth/callback`](#auth-routes) | — | OAuth / email PKCE code exchange |
| [`GET /auth/confirm`](#auth-routes) | — | Token-hash email confirmation |
| [`GET /auth/revoked`](#auth-routes) | — | Clear a dead session cookie |

### `GET /api/health`

Public, never rate limited, never redirected.

```bash
curl -s https://diskarte-ten.vercel.app/api/health
```

```json
{
  "status": "ok",
  "service": "diskarte",
  "version": "dev",
  "uptimeSeconds": 512,
  "timestamp": "2026-11-06T03:15:00.000Z",
  "checks": { "config": "ok", "livekitSecrets": "ok" }
}
```

- `?deep=1` also calls Supabase Auth's `/auth/v1/health` (3 s timeout) and adds
  `"supabase": "ok" | "unreachable" | "skipped"`. Deep checks return **503** when `status` is
  `degraded`; plain liveness always returns **200** so a container isn't restarted for an upstream
  blip.
- `version` is `APP_VERSION`, else the first 7 characters of `RENDER_GIT_COMMIT`, else `dev`.
- `HEAD` returns 200 with no body.

### `POST /api/livekit/token`

```http
POST /api/livekit/token
Content-Type: application/json
Origin: https://diskarte-ten.vercel.app

{"channelId":"6f1c…"}            // voice channel
{"conversationId":"0b9e…"}       // or a DM conversation (exactly one key)
```

```json
{ "token": "eyJhbGciOi…", "url": "wss://example.livekit.cloud", "room": "voice:6f1c…" }
```

Errors: `400` invalid body / not a voice channel, `401`, `403` (not a member, timed out, not a
participant), `404`, `429` (20/min/user), `503` (LiveKit not configured). Token TTL is 1 hour,
scoped to the one room. Details: [voice-and-video.md](../architecture/voice-and-video.md#token-issue).

### `POST /api/livekit/webhook`

Called by LiveKit Cloud. Body ≤ 64 KB; the `Authorization` header must be LiveKit's signed JWT
(verified with `LIVEKIT_API_KEY`/`SECRET`, including the body hash). For `participant_joined`,
`participant_left`, `participant_connection_aborted`, `track_published`, `track_unpublished` and
`room_finished` on a `voice:<uuid>` room, it broadcasts an empty `voice_changed` event on the
server's private `server:<id>` topic. Returns `204` (handled or ignored), `401` (bad signature),
`413`, or `503` (database/broadcast failure, so LiveKit retries). Needs `SUPABASE_SERVICE_ROLE_KEY`.

### `GET /api/voice-preview`

`?serverId=<uuid>` → `{ channels: PreviewChannel[], limited: boolean }` where each channel has
`id, name, count, participants[≤8] { id, profile, muted, screen }, streamers[]`. Requires membership,
no platform ban, completed MFA; verification gates apply. `400` bad id, `401`, `403`, `429` (45/min),
`503` (LiveKit/database unavailable).

### `GET /api/push/subscription`

```json
{ "configured": true, "publicKey": "BNc…", "devices": [ { "id": "…", "device_id": "…", "label": "Chrome on Android", "created_at": "…", "last_delivered_at": null } ] }
```

`configured` is true only when all VAPID settings are present **and** `push_ready()` is true in the
database. `401` signed out, `403` MFA pending, `503` push migration missing.

### `POST /api/push/subscription`

Body ≤ 8 KB, one of:

```json
{ "action": "register", "device": "<uuid>", "label": "Firefox on Windows",
  "subscription": { "endpoint": "https://updates.push.services.mozilla.com/wpush/v2/…",
                    "keys": { "p256dh": "<87 base64url chars>", "auth": "<22 base64url chars>" } } }
{ "action": "test",   "device": "<uuid>" }
{ "action": "remove", "device": "<uuid>" }
```

→ `{ "ok": true }`. The endpoint must be an allow-listed push vendor over HTTPS; the P-256 key is
validated. Errors: `400` invalid, `401`, `403` (MFA pending; not for `remove`), `413`, `429`
(`PUSH_RATE_LIMIT` from the database: wait a minute), `503` (push not configured).

### `POST /api/push/dispatch`

Internal: called by the database (`pg_net`) with `Authorization: Bearer <PUSH_DISPATCH_SECRET>`.
The body is ignored — recipients and payloads come only from the database. Returns the batch counts
as JSON, `401` (wrong secret), `503` (secret missing/shorter than 32 characters, VAPID/service role
missing, or queue failure). `maxDuration = 60` s. See [background-jobs.md](../architecture/background-jobs.md#web-push-outbox).

### `POST /api/webhooks/<id>/<token>`

The integration endpoint. An admin creates the URL in **Server settings → Webhooks**; the token is
shown once (48 hex characters) and stored only as a hash.

```bash
curl -X POST "https://diskarte-ten.vercel.app/api/webhooks/$WEBHOOK_ID/$WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"Build #42 passed ✅","username":"CI"}'
```

```json
{ "id": "a7d3…" }
```

| Field | Rules |
| --- | --- |
| `content` | Required string, 1–2000 characters (Discord-compatible name, so existing scripts work) |
| `username` | Optional display name for this post (stored as `webhook_name`, ≤ 32 chars) |

| Status | Body |
| --- | --- |
| `200` | `{ "id": "<message uuid>" }` |
| `400` | `Send JSON: {"content": "…"}` · `content must be 1–2000 characters` · `username must be text` |
| `404` | `Unknown webhook` (bad id/token format, wrong token, deleted webhook or channel) |
| `413` | Body over 16 KB |
| `429` | `Slow down: 30 messages a minute`, `Retry-After: 60` |
| `503` | `Couldn't post` |

Webhook posts have no author, can't ping `@everyone`/`@here`, and go through the database function
`post_webhook_message`, which is executable by `anon` only and verifies the token hash. The proxy
still rate-limits the path per IP (120/min).

### `GET /api/unfurl`

`?url=<http(s) URL ≤ 2048 chars>` → `{ "preview": { url, siteName, title, description, image, color } | null }`.
Fetched server-side through [`lib/ssrf.ts`](../../diskarte/src/lib/ssrf.ts): default ports only,
every resolved address must be public (checked at connect time to defeat DNS rebinding), redirects
re-checked by hand, 512 KB and 5 s caps. `image` is rewritten to a signed `/api/unfurl/image` URL.
Results are cached per instance for 1 hour (500 entries). `400 Link not allowed`, `401`, `429`.

### `GET /api/unfurl/image`

`?u=<image url>&s=<signature>` — only URLs signed by `/api/unfurl` (HMAC-SHA256 with a key derived
from `LIVEKIT_API_SECRET`). Returns PNG/JPEG/GIF/WebP ≤ 3 MB with `Content-Security-Policy:
default-src 'none'; sandbox`, `nosniff` and a 1-day immutable cache. `403` bad signature or blocked
host, `404` not an allowed image, `502` upstream failure. This exists because the CSP blocks
third-party images.

### `GET /api/gifs`

`?q=<≤50 chars>&offset=<n>` (trending when `q` is empty) → `{ gifs: [{ id, title, preview, width, height, url }], next: number | null }`.
Pages of 24, rated PG-13. `503` when `GIPHY_API_KEY` isn't set, `401`, `429`, `502`.

### `GET /api/admin/snapshot`

Super admins only (proxy and handler both check `is_super_admin()`; every RPC checks again).
`?q=<≤64 chars>` filters the roster server-side. Returns `{ overview, users, voice, audit, broadcasts,
reports, traffic, generatedAt }` in one round trip. `401`, `403`, `500` (migration missing).

### Auth routes

| Route | Behaviour |
| --- | --- |
| `GET /auth/callback?code=…&next=…` | Exchanges a PKCE code (OAuth, email link, password reset) for a session, redirects to `next` (same-site paths only, via `safeRedirectPath`) or `/login?error=…` |
| `GET /auth/confirm?token_hash=…&type=…&next=…` | For email templates using `{{ .TokenHash }}`; types `signup, invite, magiclink, recovery, email_change, email`; default `next` is `/onboarding` |
| `GET /auth/revoked?next=…` | Signs out locally if a cookie is still present, then `/login?error=Your session ended…` |

## Server Actions

All actions: verify the session (`getSessionUser()`, redirect to `/login` if missing), apply a
per-user in-process limit (`mutation`: 60/min; `message`: 20/10 s), validate with Zod, call Supabase
as the user, and return:

```ts
interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;                         // user-facing message
  fieldErrors?: Record<string, string>;   // per-field validation
  data?: T;
  code?: string;                          // machine-readable, e.g. "SLOWMODE", "AUTOMOD_BLOCKED"
  retryAfter?: number;                    // seconds (slow mode)
}
```

| File | Actions |
| --- | --- |
| [`app/(auth)/actions.ts`](../../diskarte/src/app/(auth)/actions.ts) | `signInAction`, `signUpAction`, `signInWithProviderAction`, `requestPasswordResetAction`, `signOutAction` (all padded to ≥ 450 ms to blunt timing enumeration) |
| [`account.ts`](../../diskarte/src/actions/account.ts) | `changePasswordAction`, `deleteAccountAction` |
| [`profile.ts`](../../diskarte/src/actions/profile.ts) | `updateProfileAction`, `setStatusAction` |
| [`messages.ts`](../../diskarte/src/actions/messages.ts) | `sendMessageAction`, `editMessageAction`, `deleteMessageAction`, `setPinnedAction`, `toggleReactionAction` |
| [`social.ts`](../../diskarte/src/actions/social.ts) | `sendFriendRequestAction`, `respondFriendRequestAction`, `removeFriendAction`, `blockUserAction`, `openDmAction`, `createGroupDmAction`, `leaveDmAction`, `sendDirectMessageAction`, `editDirectMessageAction`, `deleteDirectMessageAction` |
| [`servers.ts`](../../diskarte/src/actions/servers.ts) | `createServerAction`, `joinServerAction`, `joinPublicServerAction`, `updateServerAction`, `deleteServerAction`, `leaveServerAction`, `transferOwnershipAction`, `createInviteAction`, `revokeInviteAction`, `regenerateInviteAction`, `createChannelAction`, `updateChannelAction`, `reorderChannelsAction`, `deleteChannelAction`, `setMemberRoleAction`, `kickMemberAction`, `setNicknameAction`, `createRoleAction`, `updateRoleAction`, `deleteRoleAction`, `assignRoleAction`, `setChannelAccessAction` |
| [`moderation.ts`](../../diskarte/src/actions/moderation.ts) | `updateAutomodAction`, `updateSupportAction`, `banMemberAction`, `unbanMemberAction`, `timeoutMemberAction`, `removeTimeoutAction`, `warnMemberAction`, `setBadgeAction`, `addSoundboardClipAction`, `removeSoundboardClipAction` |
| [`voice.ts`](../../diskarte/src/actions/voice.ts) | `moderateVoiceAction` (mute, unmute, deafen, undeafen, disconnect, move) |
| [`calls.ts`](../../diskarte/src/actions/calls.ts) | `ringAction`, `respondRingAction`, `cancelRingsAction` |
| [`lfg.ts`](../../diskarte/src/actions/lfg.ts) | `createLfgAction`, `joinLfgAction`, `leaveLfgAction`, `closeLfgAction` |
| [`workspace.ts`](../../diskarte/src/actions/workspace.ts) | `saveWorkspaceAction`, `deleteWorkspaceAction` |
| [`reports.ts`](../../diskarte/src/actions/reports.ts) | `submitReportAction` |
| [`admin.ts`](../../diskarte/src/actions/admin.ts) | `dispatchBroadcastAction`, `retractBroadcastAction`, `setRoleAction`, `overrideStatusAction`, `revokeSessionsAction`, `banUserAction`, `unbanUserAction`, `setReportStatusAction` (super admins; each RPC re-checks) |

Server Actions POST to the page URL, so the proxy's same-origin and auth rate limits apply to them
too; Next.js additionally checks the `Origin` header for actions.

### Database error codes surfaced to users

Triggers and RPCs raise coded exceptions that actions translate (see `messageError()` in
`actions/messages.ts` and `communityError()` in `lib/community.ts`):

| Code | Meaning |
| --- | --- |
| `RATE_LIMITED` | 8 messages / 10 s across channels |
| `SLOWMODE` | Channel slow mode; `detail` carries seconds left |
| `AUTOMOD_BLOCKED` | Auto-mod dropped the message (insert returned zero rows) |
| `VERIFICATION_REQUIRED` | Channel requires a confirmed email/phone |
| `READ_ONLY_CHANNEL` | Only moderators may post |
| `TIMED_OUT` | Member is in a timeout |
| `RULES_NOT_ACCEPTED` | Server rules must be accepted first |
| `POST_TITLE_REQUIRED` | Forum post without a title |
| `INVALID_ATTACHMENT` | Attachment path/type/size rules failed |
| `NOT_A_TEXT_CHANNEL` | Posting into a voice channel |
| `ONLY_AUTHOR_CAN_EDIT`, `ONLY_MODERATORS_CAN_PIN`, `ONLY_ADMINS_CAN_CHANGE_ROLES`, `ONLY_ADMINS_CHANGE_PRIVACY`, `CANNOT_CHANGE_OWN_ROLE`, `ONLY_OWNER_CAN_DEMOTE_ADMINS` | Guard-trigger permission failures |
| `CONFIRMATION_MISMATCH` | Account deletion confirmation didn't match the username |
| `WEBHOOK_NOT_FOUND`, `WEBHOOK_RATE_LIMITED` | Incoming webhook failures |
| `PUSH_RATE_LIMIT` | Push registration/test throttled |
| `PUSH_WAKE_NOT_CONFIGURED` | Vault secrets missing for push wake |

## Frequently used RPCs (called from the browser)

| RPC | Called from | Purpose |
| --- | --- | --- |
| `my_unreads()`, `mark_channel_read_until`, `mark_dm_read_until`, `mark_channel_unread`, `mark_all_read` | `UnreadsProvider`, `lib/read-receipts.ts` | Unread state |
| `search_messages`, `search_all_messages` | `SearchBox`, `GlobalSearchView` | Full-text search (invoker rights, RLS applies) |
| `get_reactions_snapshot` | `useChannelChat` | Reaction recovery |
| `discover_servers` | `ExploreView` | Public Tambayan listing |
| `list_server_events` | `EventsButton` | Events with RSVP counts and own RSVP |
| `create_poll`, `vote_poll` | `Poll` | Polls |
| `publish_scheduled_messages` | `ScheduledMessages` | Publish own due messages |
| `accept_server_rules` | `RulesGate` | Rules acceptance |
| `save_channel_webhook` | `WebhooksPanel` | Create/rotate a webhook (returns the token once) |
| `save_workspace_asset`, `can_edit_workspace` | Workspace views | Shared resources/whiteboards |
| `save_account_state` | `useAccountSync` | Drafts and preferences with revisions |
| `export_my_data`, `export_server_settings` | Settings | Data export, community template export |
| `profile_connections` | `ProfileConnections` | Mutual friends and shared Tambayans |
| `heartbeat_device`, `record_site_visit` | `SessionGuard`, `VisitBeacon` | Presence inspector, traffic |
| `get_invite` | `/invite/[code]` | Invite preview |
