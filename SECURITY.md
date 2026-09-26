# Security Policy

Diskarte is a real-time chat, voice and video app. Its attack surface covers browser sessions, a Postgres database exposed through Supabase's REST and Realtime APIs, a private file bucket, and WebRTC media. This document explains how each part is protected, which trade-offs were made on purpose, and how to report a vulnerability.

## Reporting a vulnerability

**Please don't open a public issue for security problems.**

- Use GitHub's private reporting: **[Report a vulnerability](https://github.com/xndrncp08/Diskarte/security/advisories/new)** (Security → Advisories).
- Include affected routes/files, reproduction steps or a proof of concept, and the impact you observed.
- Test only against your own deployment or local stack (`npx supabase start` + `livekit-server --dev`). Don't access other people's data, run volumetric DoS, or social-engineer maintainers.

Maintainers aim to acknowledge reports within 3 days, share a remediation plan within 14 days, and credit reporters in the advisory unless you prefer to stay anonymous. Only the latest `main` is supported.

## Threat model

| Asset | Threats considered |
| --- | --- |
| Accounts & sessions | credential stuffing, brute force, account enumeration, session theft, CSRF, open redirects |
| Messages, servers, memberships | cross-tenant reads/writes via the public Supabase API, privilege escalation (member → moderator/admin), forged authorship, SQL injection |
| Rendered content | stored XSS through chat Markdown, profile fields, filenames and attachments |
| Files | malicious uploads (HTML/SVG/executables), path traversal, oversized files, reading other servers' attachments |
| Voice/video | unauthorised room joins, token theft or reuse, secret leakage, IP harvesting between participants |
| Platform | clickjacking, MIME sniffing, mixed content, cross-origin API abuse, request floods |

**Trust boundaries.** The browser is untrusted, and so is every request that reaches Supabase directly with the public anon key. Authorisation therefore lives **in the database** (RLS, grants and guard triggers), not only in the Next.js server. The Next.js server is trusted with the LiveKit secret and with minting tokens. LiveKit's SFU is trusted with media, which is encrypted in transit.

## Controls by area

### 1. Authentication & sessions

| Control | Where |
| --- | --- |
| Every request refreshes and **verifies** the session server-side with `getClaims()` (JWT signature check), not `getSession()` | `src/lib/supabase/proxy.ts`, `src/proxy.ts` |
| Protected pages (`/tambayan/*`, `/settings/*`, `/onboarding`, `/reset-password`) redirect signed-out users; server components re-check with `auth.getUser()` | `src/proxy.ts`, `src/lib/auth.ts` |
| Protected API routes (every `/api/*` except `/api/health`) return `401` without a session, and each handler re-verifies | `src/proxy.ts`, `src/app/api/livekit/token/route.ts` |
| **PKCE** for OAuth and email links: `@supabase/ssr` forces `flowType: "pkce"` and keeps the verifier in a cookie; `/auth/callback` exchanges the one-time code, `/auth/confirm` verifies token hashes | `src/app/auth/*` |
| Open-redirect protection on every `?next=` | `safeRedirectPath` in `src/lib/security.ts` |
| Cookies are host-only (no `Domain`), `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS | `src/lib/supabase/cookies.ts` |
| Password policy: 10–72 bytes with upper, lower, digit and symbol (Zod, mirrored in Supabase Auth config) | `passwordSchema` in `src/lib/profile.ts`, `supabase/config.toml` |
| Sign-in never reveals the policy or whether an account exists; sign-up and reset use vague, uniform messages | `src/lib/auth-errors.ts`, `src/app/(auth)/actions.ts` |
| Timing floor (450 ms) on sign-in, sign-up and reset, so fast-fail and slow paths look the same; Supabase compares bcrypt hashes in constant time | `withMinimumDuration` |
| **Rate limiting**: 5 auth attempts/min/IP (login, sign-up, forgot/reset/change password) and 20 auth callbacks/min/IP. Excess requests get **`429 Too Many Requests` + `Retry-After`**. Also a per-account limit on password changes | `src/proxy.ts`, `src/lib/rate-limit.ts` |
| "Log out everywhere" revokes all refresh tokens | `/settings/account` |

Rate limits live in process memory by default (Diskarte runs as one container). Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to share counters across instances. If Redis is unreachable, the limiter falls back to memory.

### 2. Database (Supabase Postgres)

- **RLS is enabled on every table** (`profiles`, `servers`, `members`, `channels`, `messages`, `reactions`, plus `storage.objects` and `realtime.messages`) in `supabase/migrations/`.
  - `profiles`: any signed-in user can read; users can only insert or update their own row (`id = auth.uid()`), and `id`/`created_at` are immutable.
  - `servers`, `channels`, `members`, `messages`, `reactions`: visible only to members of that server (`is_server_member`).
  - `messages`: inserts must be authored by the caller, and a trigger overwrites `author_id` with `auth.uid()`. Only the author can edit content. Deletes are allowed for the author or a moderator/admin. Pinning requires moderator+. Channel, server, author, reply target and attachments are immutable.
  - Roles: only admins change roles, nobody changes their own, the owner's role is fixed, only the owner demotes admins, and kicks require a strictly higher role (the owner is exempt).
- **`anon` has no table privileges.** Signed-out clients get `permission denied`, not merely zero rows. Invite previews and username checks go through narrow `SECURITY DEFINER` RPCs.
- `SECURITY DEFINER` functions pin `search_path = ''` and fully qualify every identifier, which blocks search-path hijacking. `EXECUTE` is revoked from `public`/`anon` except where intended.
- A DB-side rate limit (8 messages per 10 s per user) applies even to clients that bypass the app.
- **SQL injection:** every query goes through supabase-js/PostgREST (parameterised) or `plpgsql` with bound parameters. There is no dynamic SQL, and tests call the RPCs with injection payloads.
- **XSS:** chat content is stored as plain text/Markdown and **encoded on output**:
  - React escapes all text.
  - Raw HTML in Markdown is converted to literal text (and `skipHtml` stays on as a backstop), so `<script>` shows up as visible characters and is never parsed.
  - `<img>`, `<iframe>`, `<script>` and `<style>` are unwrapped.
  - Links are limited to `http(s):`/`mailto:` and get `rel="noopener noreferrer nofollow ugc"`.
  - Control and zero-width characters are stripped before storage.
  - Image URLs in profiles and server icons must be `https://` without quote or paren characters, checked by both a DB constraint and Zod.

> **Why no DOMPurify/sanitize-html before storage?** Messages are Markdown, not HTML. Stripping "HTML" before storage mangles legitimate content, such as developers sharing `<div>` or `<script>` snippets inside code blocks. It also gives a false sense of safety, because any future renderer would still need output encoding. Diskarte never renders stored text as HTML, and the tests in `src/components/chat/__tests__/markdown.test.tsx` and `tests/db/security.test.ts` pin that behaviour.

### 3. WebRTC & LiveKit

- `LIVEKIT_API_SECRET` exists only on the server. `src/lib/livekit.ts` and `src/lib/supabase/server.ts` import `server-only`, and a test fails CI if any `"use client"` module imports server-only modules or references server secrets / `NEXT_PUBLIC_*SECRET`.
- `POST /api/livekit/token` requires a verified session and a CSRF-safe origin. It checks that the channel exists and is a voice channel (read under RLS) **and** that an explicit `members` row exists. Only then does it mint a token that:
  - is valid for **1 hour** (connected participants are refreshed by LiveKit itself);
  - is scoped to a single room `voice:<channelId>`, with identity set to the Supabase user id;
  - allows publishing only microphone, camera and screen share, and forbids `canUpdateOwnMetadata`.
- Tokens are rate-limited per user and returned with `Cache-Control: no-store`.
- **Encryption:** WebRTC requires DTLS-SRTP for all media and SCTP-over-DTLS for data channels. LiveKit signalling runs over `wss://`.
- **IP privacy:** LiveKit is an SFU, so every participant exchanges ICE candidates and media only with the LiveKit server. There are no peer-to-peer connections, so participants never learn each other's IP addresses. The SFU operator (LiveKit Cloud or your self-hosted server) does see client IPs, as any server does.

### 4. Files & storage

| Layer | Enforcement |
| --- | --- |
| Browser | MIME allow-list `image/jpeg, image/png, image/webp, image/gif, audio/mpeg, video/mp4`, ≤ 10 MB, **magic-byte sniffing**, object name `<server>/<channel>/<user>/<uuid>.<ext>` with the extension derived from the MIME type, never from the filename |
| Server action | Zod schema: same allow-list, path regex, size cap, uploader-prefix check |
| Database trigger | Rejects any attachment outside the uploader's folder, non-UUID names, disallowed types, `..`, non-numeric or oversized sizes |
| Storage bucket | `attachments` is **private** with `file_size_limit = 10 MB` and `allowed_mime_types` set to the same list; `avatars` is public-read, images only, ≤ 5 MB |
| Storage RLS | Attachments are readable only by members of the server in the path. Uploads must come from a member, into their own folder of a real channel, with a UUID name. Deletes are limited to the uploader or moderators. Avatar uploads are limited to `<uid>/(avatar\|banner)-<uuid>.<ext>` or, for admins, `servers/<id>/icon-<uuid>.<ext>` |
| Delivery | Short-lived signed URLs from Supabase's own origin, so uploaded content never executes on Diskarte's origin. Images may be re-encoded by the Next.js optimiser (`/_next/image`), which only fetches from `remotePatterns` (Supabase Storage paths and OAuth avatar CDNs) and never serves SVG |

### 5. HTTP, CORS & CSRF

- A **per-request CSP** with a script nonce and `'strict-dynamic'`. `connect-src` allows only `'self'`, your Supabase URL (https/wss) and your LiveKit URL (https/wss). The policy also sets `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` and `form-action 'self'`, plus `upgrade-insecure-requests` on HTTPS.
- Static headers (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`, and no `X-Powered-By`.
- **CORS:** `/api/*` answers preflights only for `SITE_URL` (plus any `ALLOWED_ORIGINS`). Every other origin gets `403`, and responses carry `Vary: Origin`.
- **CSRF:** state-changing `/api/*` requests must carry a same-origin `Origin`/`Referer`. Server Actions get Next.js's built-in Origin check, and session cookies are `SameSite=Lax`.

## Deliberate trade-offs & residual risk

- **Auth cookies are not `HttpOnly`.** `@supabase/ssr`'s browser client has to read the session to authenticate Realtime, Storage uploads and RLS queries made directly from the browser. Moving all of that behind server proxies would lose Realtime. The mitigations are a strict nonce CSP, output encoding everywhere, one-hour access tokens with rotating refresh tokens, and "log out everywhere".
- **`style-src 'unsafe-inline'`.** React server-renders `style` attributes, and Framer Motion and LiveKit animate inline styles. Scripts stay nonce-locked.
- **The avatars bucket is public-read.** Profile pictures are shown to non-members, for example in invite previews. Attachments are private.
- **In-memory rate limits reset on restart** and aren't shared between replicas unless Upstash is configured. Supabase Auth applies its own per-IP limits as well.
- Media is encrypted hop-by-hop (client ↔ SFU), not end-to-end. LiveKit supports E2EE (insertable streams) if that is ever required.

## Security testing

Run `npm test`. It includes:

- `tests/db/schema.test.ts` and `tests/db/security.test.ts`: the real migrations inside PGlite, attacked as different users (RLS bypass, role escalation, forged authors, injection payloads, hostile attachments and storage paths).
- `tests/security/proxy.test.ts`: rate limits (429 + `Retry-After`), CORS, CSRF, the API session guard, route guards and CSP.
- `tests/security/hardening.test.ts`: password policy, timing floor, cookie flags, the Upstash limiter, secret isolation and static headers.
- `src/app/api/livekit/token/__tests__/route.test.ts`: session, membership, channel type, TTL, grants, signature verification and rate limiting.
- `e2e/smoke.spec.ts` (Playwright): 429 on auth brute force, foreign-origin preflights, the API session gate and security headers.

CI runs all of these on every pull request.
