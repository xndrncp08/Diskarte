# Deploying the Early Access portal to Vercel

The portal (`early-access-portal/`) is the public waitlist plus the `/admin` review dashboard. It deploys to **Vercel** on its own, independently of the Diskarte app (`diskarte/`, which runs on Render). Both use the **same Supabase project**.

```
github.com/xndrncp08/Diskorte
├── diskarte/              → Render (Docker)       https://diskarte.onrender.com
├── early-access-portal/   → Vercel (this guide)   https://early.diskarte.ph
└── supabase/              → Supabase (migrations shared by both apps)
```

## 0. Before you start

- The Supabase schema is applied, including `supabase/migrations/…_early_access.sql`. Run `npx supabase db push` from the repo root, or paste the migration files into the SQL editor in filename order (see `diskarte/DEPLOYMENT.md`).
- You have a Diskarte account. It becomes the first admin in step 5.
- For email you need a [Resend](https://resend.com) account with your sending domain verified (Resend → Domains → Add → publish the DNS records it shows), plus an API key with "Sending access".

## 1. Import the project

1. Vercel dashboard → **Add New… → Project** → import `xndrncp08/Diskorte`.
2. **Root Directory:** click *Edit* and choose **`early-access-portal`**.
3. Keep **"Include files outside of the Root Directory in the Build Step"** enabled (the default). The repo is an npm workspace, so the lockfile and `node_modules` live at the repository root.
4. **Framework preset:** Next.js. `vercel.json` already pins it, along with:
   - `installCommand`: `cd .. && npm ci --workspace early-access-portal` (installs from the workspace lockfile);
   - `buildCommand`: `npm run build`;
   - `regions`: `sin1` (Singapore, the closest to the Philippines);
   - `ignoreCommand`: skips a rebuild when nothing in the portal, `supabase/` or the lockfile changed (e.g. a Diskarte-only commit).
5. **Node.js version** (Settings → Build & Deployment): **22.x**.

Don't deploy yet. Add the environment variables first.

## 2. Environment variables

Settings → **Environment Variables**. Add these to **Production**, and see the preview note below.

| Variable | Required | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` (Supabase → Project Settings → API). `SUPABASE_URL` also works. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | the anon / publishable key. `SUPABASE_ANON_KEY` also works. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | the service-role key. **Server-only:** never prefix it with `NEXT_PUBLIC_`. |
| `RESEND_API_KEY` | ✅ | `re_…` |
| `EMAIL_FROM` | ✅ | e.g. `Diskarte <early-access@diskarte.ph>` (must be on your verified Resend domain) |
| `PORTAL_SECRET` | ✅ | 32+ random characters: `openssl rand -base64 48` |
| `APP_URL` | ✅ | the Diskarte app, e.g. `https://diskarte.onrender.com`. The welcome email links to `APP_URL/login`. |
| `SITE_URL` | — | the portal's public URL. Defaults to Vercel's production URL; set it once you add a custom domain (step 4). |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | recommended | shares rate-limit counters across Vercel's serverless instances ([free Upstash database](https://upstash.com); the Vercel Marketplace integration sets these for you). Without them, limits apply per instance; the database's own flood caps still apply. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | — | Cloudflare Turnstile CAPTCHA on the form (set both or neither; add your domain to the Turnstile site) |
| `RATE_LIMIT_APPLY_PER_HOUR`, `RATE_LIMIT_LOGIN_PER_MINUTE` | — | per-IP limits (defaults 5 and 5) |

`EMAIL_TRANSPORT` defaults to `resend` in production.

> **Preview deployments.** A preview build with the production `SUPABASE_SERVICE_ROLE_KEY` can create real accounts. Either leave the service-role, Resend and Upstash variables out of the **Preview** environment (previews can then show the form and dashboard, but approvals report "not configured"), or point Preview at a separate staging Supabase project. Keep Vercel **Deployment Protection** on for previews.

The Vercel **Supabase integration** is optional. If you connect it, it sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, which the portal accepts as-is.

Then **Deploy**. When it's live, `https://<project>.vercel.app/api/health` should return `{"status":"ok","configured":true}`.

## 3. Point the Diskarte app at the portal

On the Diskarte service (Render → Environment):

- `SIGNUP_MODE=invite` closes public sign-up. `/signup` then shows "Invite-only muna" with a button to the portal.
- `EARLY_ACCESS_URL=https://early.diskarte.ph` (or your `*.vercel.app` URL).

In Supabase, turn off **Authentication → Sign In / Providers → "Allow new users to sign up"**. Accounts are then only created by the portal's admin API, and OAuth or direct Auth API calls can't create new users on their own. Existing users can still log in.

## 4. Domain routing

1. Vercel → Project → **Settings → Domains → Add** `early.diskarte.ph` (any subdomain works).
2. At your DNS provider, add the record Vercel shows. For a subdomain that's usually a `CNAME early → cname.vercel-dns.com.`; for an apex domain it's an `A` record. Vercel issues the TLS certificate automatically.
3. Set `SITE_URL=https://early.diskarte.ph` and redeploy. It's used for canonical URLs and for the mascot image in emails (`/email/salakot.png` must be publicly reachable).
4. Optional: add `early.diskarte.ph` to your Turnstile site's hostnames, and update `EARLY_ACCESS_URL` on the Diskarte app.

A typical setup:

| Hostname | Serves |
| --- | --- |
| `diskarte.ph` / `app.diskarte.ph` | Diskarte app (Render) |
| `early.diskarte.ph` | Early Access portal (Vercel) |

The portal needs no Supabase redirect URLs. Admins sign in with email + password on the portal itself (a separate, HttpOnly `diskarte-ea-auth` cookie), and applicants log in on the Diskarte app.

## 5. Make yourself a super admin

There's intentionally no UI for this. `platform_admins` can only be written with the service role. From your machine:

```bash
npm install                                   # repo root (npm workspace)
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
npm run admin:grant -- you@example.com        # add --revoke to remove
```

Then open `https://early.diskarte.ph/admin` and sign in with your Diskarte email and password.

## 6. Smoke test

1. Submit the form on `/`. Pixel confetti should fire.
2. `/admin` → the application appears under **Pending** → **Approve**.
3. The applicant receives "Maligayang Pagdating sa Diskarte!" with a temporary password.
4. Logging in on the Diskarte app goes straight to "Palitan muna ang temporary password mo", then onboarding.

If the email fails (unverified domain, bad key), the application still becomes **Approved** with an "email failed" flag. Fix the configuration and use **Resend credentials** in the applicant's detail view. That issues a fresh temporary password.

## Other ways to run it

- **Local:** `cp early-access-portal/.env.example early-access-portal/.env`, then `npm run dev:portal` from the repo root → http://localhost:3100. `EMAIL_TRANSPORT=log` prints a one-line summary instead of sending (it never logs the password).
- **Docker (self-hosting):** `docker build -f early-access-portal/Dockerfile -t diskarte-early-access .` (from the repo root), or `docker compose --profile early-access up`.
