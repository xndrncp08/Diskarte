# Diskarte monorepo

Two self-contained Next.js 16 apps (each with its own lockfile) and shared Supabase migrations:

- `diskarte/` — the main app (Render/Docker). Its own AGENTS.md applies inside it.
- `early-access-portal/` — waitlist + admin approvals (Vercel). Its own AGENTS.md applies inside it.
- `supabase/` — migrations shared by both apps; PGlite RLS tests live in `diskarte/tests/db/`.

Not an npm workspace: Render builds with Root Directory `diskarte`, Vercel with `early-access-portal`, so nothing an app needs at build time may live outside its folder. `npm install` at the root runs `npm ci` in both apps; run app scripts with `npm <script> --prefix <app>` and add dependencies from inside the app folder.

# This is NOT the Next.js you know

Both apps use a Next.js version with breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
