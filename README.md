<p align="center">
  <img src="diskarte/public/wordmark.svg" alt="Diskarte" height="96">
</p>

<p align="center"><strong>Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.</strong><br>
An open-source Discord alternative for the Philippines: chat, voice, video and screen share for gamers, student orgs and creators.</p>

---

## Monorepo

An npm workspace holding two independently deployed Next.js 16 apps that share one Supabase project.

```
.
├── diskarte/               The Diskarte app: Tambayans, realtime chat, LiveKit voice/video,
│                           Bantay-Bayan moderation, friends & DMs  → Render (Docker)
├── early-access-portal/    Early Access waitlist + super-admin review dashboard  → Vercel
├── supabase/               Shared migrations (schema, RLS, triggers, RPCs) + local config
├── package.json            Workspace root: one lockfile, one install, scripts for both apps
├── docker-compose.yml      Local containers (app, portal, LiveKit)
├── render.yaml             Render Blueprint for diskarte/
└── SECURITY.md             Threat model and controls for both apps
```

| | Docs | Deploys to |
| --- | --- | --- |
| **Diskarte app** | [diskarte/README.md](diskarte/README.md) · [diskarte/DEPLOYMENT.md](diskarte/DEPLOYMENT.md) | Render (Docker), with Supabase + LiveKit Cloud |
| **Early Access portal** | [early-access-portal/README.md](early-access-portal/README.md) · [early-access-portal/DEPLOYMENT.md](early-access-portal/DEPLOYMENT.md) | Vercel (Root Directory `early-access-portal`) |
| **Database** | [`supabase/migrations/`](supabase/migrations) | Supabase (`npx supabase db push` from this folder) |

## Quick start

```bash
npm install                                          # installs both workspaces
cp diskarte/.env.example diskarte/.env.local          # Supabase + LiveKit credentials
cp early-access-portal/.env.example early-access-portal/.env
npm run dev                                          # Diskarte → http://localhost:3000
npm run dev:portal                                   # Early Access portal → http://localhost:3100
```

Local Supabase: `npx supabase start` (needs Docker). It applies `supabase/migrations` and prints the local keys.

## Scripts (repository root)

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run dev:portal` | Dev server for the app / the portal |
| `npm run build` | Production builds of both apps |
| `npm run lint` · `npm run typecheck` · `npm test` | Lint, type-check and Vitest suites in both workspaces |
| `npm run test:e2e` | Playwright suite (the app, plus the cross-app Early Access journey when `E2E_FULL=1`) |
| `npm run brand:assets` | Re-render icons and OG cards, and export the portal's brand art |
| `npm run admin:grant -- you@example.com` | Grant the Early Access `super_admin` role (service role key required) |

Run any workspace script directly with `-w diskarte` or `-w early-access-portal`, e.g. `npm test -w early-access-portal`.

## Early Access flow

1. Someone applies on the portal. The form is protected by Zod, a honeypot, a signed timing token, rate limits and optional Turnstile, and success shows retro confetti.
2. A `super_admin` approves them on `/admin`, singly or in bulk.
3. The portal creates their Supabase account with a one-time temporary password and emails **"Maligayang Pagdating sa Diskarte!"** (via Resend).
4. On first login, the Diskarte app makes them choose their own password, then onboard.

With `SIGNUP_MODE=invite` on the app, public sign-up stays closed until launch.

## License & security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
