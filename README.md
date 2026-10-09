<p align="center">
  <img src="diskarte/public/wordmark.svg" alt="Diskarte" height="96">
</p>

<p align="center"><strong>Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.</strong><br>
An open-source Discord alternative for the Philippines: chat, voice, video and screen share for gamers, student orgs and creators.</p>

---

## Repository

The Diskarte app and its Supabase migrations. The app folder is **self-contained** (own `package.json`, `package-lock.json`, Dockerfile and config), so Render builds it with Root Directory `diskarte`.

```
.
├── diskarte/               The Diskarte app: Tambayans, realtime chat, LiveKit voice/video,
│                           Bantay-Bayan moderation, friends & DMs, and the Super Admin
│                           Control Center  → Render (Docker)
├── supabase/               Migrations (schema, RLS, triggers, RPCs) + local config
├── package.json            Orchestrator: scripts that run in the app (no shared lockfile)
├── docker-compose.yml      Local containers (app, LiveKit)
├── render.yaml             Render Blueprint (rootDir: diskarte)
└── SECURITY.md             Threat model and controls
```

| | Docs | Deploys to |
| --- | --- | --- |
| **Diskarte app** | [diskarte/README.md](diskarte/README.md) · [diskarte/DEPLOYMENT.md](diskarte/DEPLOYMENT.md) | Render (Docker), with Supabase + LiveKit Cloud |
| **Database** | [`supabase/migrations/`](supabase/migrations) | Supabase (`npx supabase db push` from this folder) |

## Quick start

```bash
npm install                                          # runs `npm ci` inside diskarte/
cp diskarte/.env.example diskarte/.env.local          # Supabase + LiveKit credentials
npm run dev                                          # Diskarte → http://localhost:3000
```

Local Supabase: `npx supabase start` (needs Docker). It applies `supabase/migrations` and prints the local keys.

## Scripts (repository root)

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` · `npm run typecheck` · `npm test` | Lint, type-check and the Vitest suite (unit, component and PGlite RLS tests) |
| `npm run test:e2e` | Playwright suite (journeys run when `E2E_FULL=1`) |
| `npm run brand:assets` | Re-render icons and OG cards |
| `npm run admin:grant -- you@example.com` | Make the first Super Admin (service role key required); after that, roles are managed in the Control Center |

## Super Admin Control Center

The old Early Access waitlist portal is retired; its admin role table, routes and dashboard were recycled into a Control Center inside the signed-in workspace:

- **Access:** `/admin` (and `/tambayan/admin`) for platform `super_admin`s only. The proxy, the page and every Server Action / API route verify the role in the database (`is_super_admin()`); everyone else is redirected to the canvas before anything renders, and the Control Center code is only downloaded by super admins.
- **On the canvas** it's a glass panel that docks to the right edge, snaps magnetically and shares coupled resizing with neighbouring panels; on phones it's a full-screen page.
- **Network roster & presence inspector:** every account with live presence (Online, AFK / Tulog, Nagluto ng Canton, Busy, Offline), LiveKit stage connections, device fingerprints, sessions and last-active times; instant client-side filters plus server-side search.
- **Moderation:** roles (Super Admin, Moderator, Standard Member — mirrored into Diskarte HQ), forced status overrides, session revocation and temporary or permanent bans, all written to `admin_audit_logs`.
- **Global Announcement Dispatcher:** compose with headers, callout boxes (`> [!INFO]`, `[!SUCCESS]`, `[!WARNING]`, `[!CRITICAL]`) and code blocks, preview, and broadcast to HQ's #announcements and/or #global-lounge. Connected canvases update live; flag it sticky to pin a banner on every canvas.

## License & security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).
