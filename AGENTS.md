# Diskarte repository

One self-contained Next.js 16 app (its own lockfile) and its Supabase migrations:

- `diskarte/` — the app (Render/Docker), including the Super Admin Control Center. Its own AGENTS.md applies inside it.
- `supabase/` — migrations; PGlite RLS tests live in `diskarte/tests/db/`.

Not an npm workspace: Render builds with Root Directory `diskarte`, so nothing the app needs at build time may live outside its folder. `npm install` at the root runs `npm ci` in the app; run app scripts with `npm <script> --prefix diskarte` and add dependencies from inside the app folder.

# This is NOT the Next.js you know

The app uses a Next.js version with breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
