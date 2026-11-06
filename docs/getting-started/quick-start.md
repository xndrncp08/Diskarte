# Quick start

Get Diskarte running locally, sign in and send a message in about ten minutes.

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | ≥ 20.9 (CI and Docker use 22) | `engines` in `package.json` |
| npm | bundled with Node | The app has its own `package-lock.json` |
| A Supabase project | hosted (free) **or** local via the Supabase CLI | Database, auth, realtime, storage |
| A LiveKit server | LiveKit Cloud (free) **or** a local dev server | Voice/video (the rest of the app works without it) |
| Docker *(optional)* | any recent | Local Supabase (`supabase start`), local LiveKit, building the image |
| Chromium for Playwright *(optional)* | `npx playwright install chromium` | Browser tests |

Supported browsers for using the app: current Chrome/Edge, Firefox and Safari. iOS needs 16.4+ for
Web Push (installed to the Home Screen).

## 1. Install

```bash
git clone https://github.com/xndrncp08/Diskarte.git
cd Diskarte
npm install            # runs `npm ci` inside diskarte/
```

Or work directly in the app folder: `cd diskarte && npm ci`.

## 2. Choose a database

**Option A — hosted Supabase project (no Docker).** Create a free project, then apply the migrations
from the repository root:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

In the dashboard: Auth → URL configuration → add `http://localhost:3000/auth/callback`; Realtime →
Settings → turn off "Allow public access". For quicker local sign-ups you can turn off email
confirmation in a development project.

**Option B — local Supabase (Docker).**

```bash
npx supabase start     # from the repository root; applies supabase/migrations
npx supabase status    # prints API URL (http://127.0.0.1:54321) and anon key
```

Local settings ([`supabase/config.toml`](../../supabase/config.toml)): email confirmation off, the
same password policy as production, a local mail catcher (`[local_smtp]`) on port 54324.

## 3. Configure

```bash
cp diskarte/.env.example diskarte/.env.local
```

Fill in at least:

```ini
SUPABASE_URL=https://<ref>.supabase.co          # or http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon or publishable key>
LIVEKIT_URL=wss://<project>.livekit.cloud       # or ws://localhost:7880
LIVEKIT_API_KEY=<key>                           # or devkey
LIVEKIT_API_SECRET=<secret>                     # or secret
SITE_URL=http://localhost:3000
AUTH_OAUTH_PROVIDERS=                           # empty = email/password only
```

For a local LiveKit dev server: `docker compose --profile livekit up livekit` (key `devkey`,
secret `secret`). Every variable is described in the [environment reference](../reference/environment.md).

## 4. Run

```bash
npm run dev            # http://localhost:3000 (Turbopack)
```

If port 3000 is taken: `npm run dev -- -p 3001` and set `SITE_URL=http://localhost:3001`, otherwise
API POSTs fail the same-origin check.

## 5. First-run walkthrough

1. Open `http://localhost:3000` → **Sign up**. Pick a username (3–32 lowercase letters, digits, `_`
   or `.`) and a password with 10+ characters including upper, lower, digit and symbol.
2. Confirm your email if your project requires it (local: no confirmation).
3. **Onboarding**: choose a salakot avatar colour or upload a picture, add a bio and status.
4. You land in `/tambayan` and are already a member of **Diskarte HQ**.
5. Create your own Tambayan with **Add a server** (+) on the server rail, open `#general` and send a message.
6. Open a second browser profile, sign up another account, and join with the invite link
   (server menu → **Invite people**) to see messages arrive live.
7. Click a voice channel to join a call (allow microphone access).
8. Make yourself a super admin to explore the Control Center:

   ```bash
   cd diskarte
   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- you@example.com
   ```

## 6. Check your setup

```bash
curl -s http://localhost:3000/api/health?deep=1    # "status":"ok", "supabase":"ok"
npm run db:check --prefix diskarte                 # every object "present"
npm test --prefix diskarte                         # Vitest incl. PGlite RLS tests (no services needed)
```

## Common setup issues

| Problem | Fix |
| --- | --- |
| "Missing configuration" notice | A required variable is missing or malformed (`LIVEKIT_URL` must start with `ws://` or `wss://`; the anon key must be ≥ 20 chars) |
| Sign-in loops back to `/login` | `SITE_URL` doesn't match the URL in the browser, or the callback URL isn't in Supabase's redirect list |
| Messages only appear after refresh | Realtime public access is still on *and* you're testing against production rules, or migrations weren't applied (they add tables to the publication) |
| `403 Cross-site request blocked` | `SITE_URL` port differs from the dev server's port |
| Voice: "Voice is not configured" | LiveKit key/secret missing |
| Microphone blocked | Use `localhost` or HTTPS |
| `supabase start` errors | Docker isn't running |

More in [troubleshooting](../operations/troubleshooting.md).

## Next steps

- [Repository tour and conventions](../contributing/README.md)
- [Architecture overview](../architecture/overview.md)
- [Testing guide](../testing.md)
