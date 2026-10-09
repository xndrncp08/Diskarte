# Deploying Diskarte for ₱0

Diskarte runs entirely on free tiers:

| Piece | Service (free tier) | What it does |
| --- | --- | --- |
| Web container | **Render** Web Service (Docker) | Next.js 16 standalone server, API routes, CSP proxy |
| Database, Auth, Realtime, Storage | **Supabase** | Postgres + Row-Level Security, email/OAuth login, live updates, file uploads |
| Voice, video, screen share | **LiveKit Cloud** | WebRTC SFU; Diskarte mints short-lived room tokens server-side |

```
Browser ──HTTPS──▶ Render (Next.js container) ──▶ Supabase (Postgres/Auth/Storage)
   │  └──────────WSS (Realtime)────────────────────▶ Supabase Realtime
   └────────────WebRTC (token from /api/livekit/token)──▶ LiveKit Cloud
```

All configuration is read **at runtime**, so the same Docker image works locally, in CI and on Render.

---

## 1. Supabase (database, auth, realtime, storage)

1. Create a project at [supabase.com](https://supabase.com) → **New project**. Pick the **Southeast Asia (Singapore)** region for the lowest latency from the Philippines.
2. **Apply the schema.** Either:
   - **SQL editor:** run each file in the repo's `supabase/migrations/` **in filename order** (`…_schema.sql`, `…_security_hardening.sql`, `…_community.sql`, `…_early_access.sql`, … through `…_admin_control_center.sql`) via *SQL Editor → New query*; or
   - **CLI (from the repository root):** `npx supabase link --project-ref <your-ref>` then `npx supabase db push`.

   This creates every table, including the community ones (`audit_logs`, `server_bans`, `server_badges`, `lfg_beacons`, `soundboard_clips`, `friendships`, `user_blocks`, `dm_conversations`, `direct_messages`…). It also sets up all RLS policies, guard triggers, RPCs, the Realtime publication, private-channel authorisation and the `avatars` / `attachments` / `soundboard` Storage buckets. No new environment variables are needed.
3. **Auth → URL Configuration**
   - *Site URL*: your Render URL, e.g. `https://diskarte-pzg6.onrender.com`
   - *Redirect URLs*: `https://diskarte-pzg6.onrender.com/auth/callback` (add `http://localhost:3000/auth/callback` for local dev)
4. **Auth → Providers**
   - *Email*: keep **Confirm email** on for production.
   - *Password security* (Auth → Providers → Email): minimum length **10** and require **lowercase, uppercase, digits and symbols** — the same policy the app enforces.
   - *GitHub / Google / Discord* (optional): create an OAuth app whose only authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback` (never the app URL or localhost), paste the client id/secret into Supabase, and list the enabled providers in `AUTH_OAUTH_PROVIDERS`.
5. **Realtime → Settings**: turn **off** “Allow public access” so only the private, RLS-authorised channels (`server:<id>` presence, `channel:<id>` typing) are allowed.
6. *(Optional)* **Auth → Email Templates → Confirm signup**: to use the token-hash flow, set the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
   The default PKCE link (`/auth/callback`) also works.
7. Copy **Project Settings → API**: the *Project URL* → `SUPABASE_URL`, and the *anon / publishable* key → `SUPABASE_ANON_KEY`.

> The anon key is public by design. Data is protected by Row-Level Security; the Diskarte app **never** needs the service-role key, so don't give it one. Only the one-off `npm run admin:grant` script uses it, from your machine (section 4).

## 2. LiveKit Cloud (voice, video, screen share)

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) and create a project.
2. Copy the WebSocket URL (`wss://<project>.livekit.cloud`) → `LIVEKIT_URL`.
3. **Settings → Keys → Create key** → `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
   The secret stays on the server; browsers only ever receive 2-hour tokens scoped to one voice room, issued after Diskarte verifies the Supabase session and channel membership.

## 3. Render (web container)

1. Fork `https://github.com/xndrncp08/Diskorte` (or push your copy to GitHub).
2. Render dashboard → **New → Blueprint** → select the repo. Render reads the root `render.yaml` and creates a free Docker web service in Singapore with `/api/health` as its health check. The service uses **Root Directory `diskarte`**: Render builds `./Dockerfile` with the `diskarte/` folder as the Docker context (the app has its own `package-lock.json`), and only redeploys when files under `diskarte/` change. If you create the service by hand instead, set Runtime *Docker*, Root Directory `diskarte`, Dockerfile path `./Dockerfile`, and health check path `/api/health`.
3. Fill in the prompted variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
4. Deploy. When it's live, open `https://<service>.onrender.com/api/health?deep=1`; it should report `"status":"ok"` with `"supabase":"ok"`.
5. Go back to Supabase **Auth → URL Configuration** and make sure the Render URL is the Site URL and is in the redirect list.
6. **Custom domain** (optional): add it in Render, then set `SITE_URL=https://your.domain` and add `https://your.domain/auth/callback` to Supabase redirects.

**Free-tier notes**
- Render free services sleep after ~15 minutes idle; the first request takes ~30–60s to wake. An external uptime pinger hitting `/api/health` keeps it warm.
- Supabase free projects pause after a week without activity. Resume them from the dashboard.
- `NODE_OPTIONS=--max-old-space-size=384` keeps Node inside the 512 MB free instance.

## 4. Super Admin Control Center

The Control Center (`/admin`) is part of this app; there is nothing extra to deploy.

- **Database:** `…_admin_control_center.sql` (in `supabase/migrations`) recycles `platform_admins` as the platform role table (`super_admin` / `moderator`), archives the old waitlist applications into `admin_audit_logs` and drops the waitlist, and adds `system_broadcasts`, `account_controls`, `user_devices` and the admin RPCs. On a hosted project that you update through the SQL Editor, run it after the earlier files.
- **First super admin:** sign up in the app, then from `diskarte/` run `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- you@example.com`. Reload the app: the shield button on the command rail opens the Control Center. Further roles are managed inside it.
- **Retired portal:** if you deployed the old `early-access-portal/` to Vercel, delete that Vercel project (its Root Directory no longer exists) and remove `EARLY_ACCESS_URL` from the Render service.
- **Sign-up:** the Render service ships with `SIGNUP_MODE=invite`, which pauses public sign-up. Remove it (and turn **Auth → Providers → Allow new users to sign up** back on in Supabase) to open registrations.
- **Temporary passwords:** accounts carrying `must_change_password` (e.g. created by the old portal) are still sent to `/reset-password?first=1` until they choose their own password.

## Environment variables

| Variable | Required | Where it's used | Notes |
| --- | --- | --- | --- |
| `SUPABASE_URL` | ✅ | server + browser | `https://<ref>.supabase.co` (falls back to `NEXT_PUBLIC_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | ✅ | server + browser | anon/publishable key (`SUPABASE_PUBLISHABLE_KEY` also accepted) |
| `LIVEKIT_URL` | ✅ | server + browser | `wss://…` |
| `LIVEKIT_API_KEY` | ✅ | server only | token signing |
| `LIVEKIT_API_SECRET` | ✅ | server only | token signing; never exposed |
| `SITE_URL` | — | server | public base URL; defaults to `RENDER_EXTERNAL_URL`, then `http://localhost:3000` |
| `AUTH_OAUTH_PROVIDERS` | — | server | e.g. `github,google,discord`; empty hides OAuth buttons |
| `ALLOWED_ORIGINS` | — | proxy | extra origins allowed to call `/api/*` cross-origin (CORS + CSRF) |
| `RATE_LIMIT_AUTH_PER_MINUTE` | — | proxy | per-IP auth attempts per minute (default **5**) |
| `RATE_LIMIT_API_PER_MINUTE` | — | proxy | per-IP `/api/*` requests per minute (default 120) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | — | proxy | share rate-limit counters across instances (free Upstash tier) |
| `SIGNUP_MODE` | — | server | `invite` pauses public sign-up |
| `PORT` / `HOSTNAME` | — | container | set by the Dockerfile (Render injects `PORT`) |

## Local development

```bash
cd diskarte                  # self-contained app with its own package-lock.json
npm ci
cp .env.example .env.local   # fill in values (hosted or local services)
npm run dev                  # http://localhost:3000
# or, from the repository root: npm install && npm run dev
```

**Local Supabase** (needs Docker): `npx supabase start` (from the repository root) applies `supabase/migrations` automatically and prints a local URL (`http://127.0.0.1:54321`) and anon key. Email confirmation is disabled locally (`supabase/config.toml`), so sign-ups log straight in.

**Local LiveKit**: `docker compose --profile livekit up livekit`, then use
`LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`.

## Docker

```bash
# from diskarte/ — the same context Render uses (Root Directory: diskarte)
docker build -t diskarte .
docker run --rm -p 3000:3000 --env-file .env.local diskarte
# or everything with compose (root docker-compose.yml)
docker compose up --build
```

The multi-stage `diskarte/Dockerfile` installs from the app's own lockfile (`npm ci`) and builds Next.js in `standalone` mode on `node:22-alpine`, then runs it on plain `alpine` with Alpine's own `nodejs` package (shared system libraries instead of the ~110 MB bundled binary) and English-only ICU data (all time zones included), leaving room for sharp so `next/image` can serve AVIF/WebP, as an unprivileged user with a `HEALTHCHECK` on `/api/health`. CI prints the final image size and fails the build if it grows past 150 MB.

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and push to `main`:
lint → type-check → unit/DB tests → Docker build (size check + container health smoke test) → Playwright E2E against a throwaway local Supabase stack and a LiveKit dev server. The E2E suite includes the Control Center journey: non-admins are refused, and a super admin broadcasts a sticky announcement that reaches another member's open canvas live, changes their role and bans them. No repository secrets are required. Render auto-deploys `main` once it's green.

## Security checklist

See **[SECURITY.md](../SECURITY.md)** for the full threat model and controls. Highlights:


- ✅ RLS on every table; SECURITY DEFINER helpers pin `search_path`; guard triggers stop privilege escalation (role changes, pins, edits, kicks).
- ✅ DB-level message rate limiting (8 messages / 10 s) plus per-user and per-IP limits in the app.
- ✅ Per-request CSP with script nonces, `frame-ancestors 'none'`, HSTS, `nosniff`, strict referrer and permissions policies.
- ✅ CSRF: Server Actions check Origin, and `proxy.ts` blocks cross-origin POSTs to `/api/*`.
- ✅ XSS: Markdown renders without raw HTML, with protocol-allow-listed links, and without remote images.
- ✅ Attachments live in a private bucket behind signed URLs, and uploads are confined to `<server>/<channel>/<uploader>/`.
- 🔒 Keep `LIVEKIT_API_SECRET` out of the browser and out of git. Rotate keys from the LiveKit and Supabase dashboards if they leak.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Kulang ang configuration” on the login page | `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `LIVEKIT_URL` missing or malformed. Check `/api/health`. |
| OAuth returns to `/login?error=…` | The redirect URL isn't in Supabase's allow-list, or the provider callback isn't `https://<ref>.supabase.co/auth/v1/callback`. |
| Messages don't appear live | Confirm the migration ran (it adds tables to the `supabase_realtime` publication) and the browser can reach `wss://<ref>.supabase.co`. |
| Presence / typing never shows | Private channels need the `realtime.messages` policies from the migration; re-run it on a fresh project. |
| “Voice is not configured” | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are missing on the server. |
| Mic or camera blocked | Browsers only allow media on HTTPS (or `localhost`). Check site permissions. |
