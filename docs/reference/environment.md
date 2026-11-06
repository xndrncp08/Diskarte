# Environment variables

All variables are read **at runtime** from `process.env` (never inlined at build time), so the same
build runs everywhere. Locally, put them in `diskarte/.env.local` (copy
[`diskarte/.env.example`](../../diskarte/.env.example)). On Vercel/Render set them in the project
settings and redeploy — running deployments don't pick up changes.

**Never** give a secret a `NEXT_PUBLIC_` prefix, and never commit real values.

## Required

| Variable | Exposure | Accepted fallbacks | Description |
| --- | --- | --- | --- |
| `SUPABASE_URL` | browser + server | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` (or `http://127.0.0.1:54321` locally). Also used to build the CSP and image allow-list |
| `SUPABASE_ANON_KEY` | browser + server | `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/publishable key (≥ 20 chars). Public by design; RLS protects data |
| `LIVEKIT_URL` | browser + server | `NEXT_PUBLIC_LIVEKIT_URL` | `wss://<project>.livekit.cloud` (`ws://` allowed for local dev) |
| `LIVEKIT_API_KEY` | server only | — | Signs room tokens, verifies webhooks |
| `LIVEKIT_API_SECRET` | server only | — | Signs room tokens; also the root of the link-preview image HMAC key |

Missing or malformed public values make pages show a configuration notice and `/api/health` report
`"config": "missing"`; missing LiveKit secrets report `"livekitSecrets": "missing"` and voice joins
return 503.

## Recommended

| Variable | Default | Description |
| --- | --- | --- |
| `SITE_URL` | `NEXT_PUBLIC_SITE_URL`, then `RENDER_EXTERNAL_URL`, then `http://localhost:3000` | Canonical public origin: OAuth/email redirects, invite links, metadata, CSRF/CORS origin and the host every page request is 308-redirected to. **Set it explicitly on Vercel** (stable production domain, not a preview URL). For local runs on another port, set it to that exact origin or API POSTs return 403 |
| `AUTH_OAUTH_PROVIDERS` | unset → `github,google`; empty string → none | Comma-separated subset of `github,google,discord` that are enabled in Supabase Auth. Controls which buttons appear |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | unset (in-memory limits) | Share the proxy's rate-limit counters across instances. Needed on serverless/multi-instance hosts for meaningful auth limits |

## Optional features

| Variable | Needed for | Notes |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | LiveKit webhook (voice preview refresh), Web Push dispatcher, `npm run admin:grant`, E2E role grants | Server only. User-facing code never uses it |
| `VAPID_PUBLIC_KEY` | Web Push | 87-char base64url P-256 public key |
| `VAPID_PRIVATE_KEY` | Web Push | 43-char base64url private key; must match the public key |
| `VAPID_SUBJECT` | Web Push | `mailto:you@example.com` or an `https://` contact URL |
| `PUSH_DISPATCH_SECRET` | Web Push | ≥ 32 random characters; must equal the Vault secret `diskarte_push_secret` |
| `GIPHY_API_KEY` | GIF picker | Without it the GIF button says search isn't set up |
| `SIGNUP_MODE` | Closing registration | `invite` pauses public sign-up (also turn off "Allow new users to sign up" in Supabase so OAuth can't create accounts) |
| `ALLOWED_ORIGINS` | Cross-origin API callers | Comma-separated extra origins for CORS + CSRF on `/api/*` |

Push is enabled only when **all five** push values are valid (`pushConfig()` in
[`lib/push-server.ts`](../../diskarte/src/lib/push-server.ts)) and the database setup has run.
Generate the keys once and keep them stable:

```bash
cd diskarte
node -e 'console.log(require("web-push").generateVAPIDKeys())'
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))'
```

## Tuning

| Variable | Default | Description |
| --- | --- | --- |
| `RATE_LIMIT_AUTH_PER_MINUTE` | `5` | Auth form POSTs per client IP per minute |
| `RATE_LIMIT_AUTH_CALLBACK_PER_MINUTE` | `20` | `/auth/callback` + `/auth/confirm` per IP per minute |
| `RATE_LIMIT_API_PER_MINUTE` | `120` | `/api/*` requests per IP per minute |
| `APP_VERSION` | `RENDER_GIT_COMMIT` (first 7 chars), else `dev` | Reported by `/api/health` |
| `NODE_OPTIONS` | `--max-old-space-size=384` in `render.yaml` | Keeps Node inside a 512 MB free instance |

## Platform-provided

| Variable | Set by | Used for |
| --- | --- | --- |
| `PORT`, `HOSTNAME` | Dockerfile (`3000`, `0.0.0.0`), Render injects `PORT` | Standalone server bind address |
| `NODE_ENV` | Next.js | Dev-only CSP relaxations (`unsafe-eval`, localhost sockets) |
| `RENDER_EXTERNAL_URL`, `RENDER_GIT_COMMIT` | Render | `SITE_URL` fallback, health `version` |
| `DISKARTE_SHARP_TARGET` | Dockerfile build stage (`linuxmusl`) | Excludes non-musl `sharp` binaries from the standalone trace |
| `NEXT_PUBLIC_IMAGE_HOSTS` | `next.config.ts` | Internal: serialized image-optimizer host list for `<SmartImage>` |

## Testing

| Variable | Used by | Description |
| --- | --- | --- |
| `E2E_FULL` | Playwright | `1` runs journeys that need Supabase + LiveKit (CI sets it) |
| `E2E_BASE_URL` | Playwright | Test an already-running deployment instead of starting the standalone build |
| `E2E_PORT` | Playwright | Port for the local standalone server (default 3000) |
| `CI` | Playwright | Retries, 2 workers, `forbidOnly`, GitHub reporter |

## Supabase-side configuration (not environment variables)

| Setting | Value |
| --- | --- |
| Auth → URL configuration | Site URL = `SITE_URL`; redirect URLs include `<SITE_URL>/auth/callback` (and `http://localhost:3000/auth/callback` for dev) |
| Auth → Email | Confirm email on; password minimum 10 with lowercase, uppercase, digits and symbols (matches the app's checklist) |
| Auth → OAuth providers | Provider callback is `https://<ref>.supabase.co/auth/v1/callback` |
| Realtime → Settings | **Allow public access: off** |
| Vault | `diskarte_push_url`, `diskarte_push_secret` (push only) |
