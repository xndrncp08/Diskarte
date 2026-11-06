<p align="center">
  <img src="diskarte/public/wordmark.svg" alt="Diskarte" height="96">
</p>

<p align="center"><strong>Tara, Tambay Tayo. Ang Bagong Istambayan ng Bayan.</strong><br>
An open-source Discord alternative for the Philippines: chat, voice, video and screen share for gamers, student orgs and creators.</p>

<p align="center">
  <a href="docs/README.md">Documentation</a> ·
  <a href="docs/getting-started/quick-start.md">Quick start</a> ·
  <a href="docs/architecture/overview.md">Architecture</a> ·
  <a href="docs/user-guide/README.md">User guide</a> ·
  <a href="SECURITY.md">Security</a>
</p>

---

## What it is

Diskarte gives communities ("Tambayans") text, voice and forum channels; friends, DMs and group calls;
moderation tools; a shared workspace; and an installable mobile app — all deployable on free tiers of
Vercel (or any Docker host), Supabase and LiveKit.

- **Messaging** — Markdown, threads, reactions, attachments, voice messages, polls, scheduled messages, search, offline queue
- **Voice and video** — LiveKit calls, screen share, soundboard, watch parties and mini-games
- **Communities** — roles and private channels, invites and discovery, rules, events, levels, webhooks
- **Moderation** — Bantay-Bayan auto-mod, timeouts, bans, audit log, and a Super Admin Control Center
- **Everywhere** — PWA, opt-in Web Push, themes, accessibility settings, low-data mode

See the [feature catalogue](docs/features/README.md) for status and details.

## Quick start

```bash
npm install                                     # runs `npm ci` inside diskarte/
cp diskarte/.env.example diskarte/.env.local    # Supabase + LiveKit credentials
npm run dev                                     # http://localhost:3000
```

Apply the database first (`npx supabase db push` to a hosted project, or `npx supabase start` with
Docker). Full walkthrough: [docs/getting-started/quick-start.md](docs/getting-started/quick-start.md).

## Repository

```text
.
├── diskarte/          The Next.js 16 app (self-contained: own lockfile, Dockerfile) — deploys to Vercel or Docker
├── supabase/          Database migrations (schema, RLS, triggers, RPCs) and local config
├── docs/              Documentation
├── docker-compose.yml Local container + optional LiveKit dev server
├── render.yaml        Render Blueprint (rootDir: diskarte)
└── SECURITY.md        Threat model, controls and vulnerability reporting
```

The root `package.json` only forwards scripts to the app; it is not an npm workspace.

| Command (from the root) | What it does |
| --- | --- |
| `npm run dev` · `npm run build` | Dev server · production build |
| `npm run lint` · `npm run typecheck` · `npm test` | ESLint · `next typegen` + `tsc` · Vitest (unit, component, PGlite RLS, docs checks) |
| `npm run test:e2e` | Playwright (backend journeys run with `E2E_FULL=1`) |
| `npm run brand:assets` | Re-render icons and social cards |
| `npm run admin:grant -- you@example.com` | Make the first Super Admin (needs the service role key) |
| `npm run docs:db --prefix diskarte` | Regenerate the [database reference](docs/reference/database.md) |

## Stack

Next.js 16 (App Router, React 19.2) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + RLS, Auth,
Realtime, Storage) · LiveKit · Zod · Vitest + PGlite · Playwright · Docker · GitHub Actions · Vercel.

## Documentation

| | |
| --- | --- |
| [Introduction](docs/getting-started/introduction.md) | What Diskarte is and its vocabulary |
| [Architecture](docs/architecture/overview.md) | How the pieces fit, realtime, voice, background jobs, decisions |
| [Database](docs/database.md) · [reference](docs/reference/database.md) | Schema, permissions, RLS |
| [API](docs/reference/api.md) · [Environment](docs/reference/environment.md) | Endpoints, actions, configuration |
| [Security](docs/security.md) · [Testing](docs/testing.md) · [Design system](docs/design-system.md) | Engineering guides |
| [Deployment](docs/operations/deployment.md) · [Troubleshooting](docs/operations/troubleshooting.md) | Operating Diskarte |
| [User guide](docs/user-guide/README.md) | For everyday users |
| [Contributing](docs/contributing/README.md) | Workflow and conventions |
| [Changelog](diskarte/CHANGELOG.md) · [Known limitations](docs/known-limitations.md) | Status |

## Credits and security

The wordmark uses glyph outlines from [Knewave](https://fonts.google.com/specimen/Knewave) by Tyler
Finck, under the SIL Open Font License 1.1 (`diskarte/assets/fonts/OFL-Knewave.txt`).

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
