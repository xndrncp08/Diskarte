# Diskarte monorepo

npm workspace with two Next.js 16 apps and shared Supabase migrations:

- `diskarte/` — the main app (Render/Docker). Its own AGENTS.md applies inside it.
- `early-access-portal/` — waitlist + admin approvals (Vercel). Its own AGENTS.md applies inside it.
- `supabase/` — migrations shared by both apps; PGlite RLS tests live in `diskarte/tests/db/`.

Install once from the root (`npm install`); run app scripts with `-w diskarte` / `-w early-access-portal`.

# This is NOT the Next.js you know

Both apps use a Next.js version with breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
