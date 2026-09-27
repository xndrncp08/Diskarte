# Diskarte Early Access portal

The public waitlist and the admin review dashboard for Diskarte's early access. It's a Next.js 16 app in the Diskarte monorepo, a sibling of `../diskarte`. It uses the same Supabase project (`../supabase`) and **deploys to Vercel**: see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

```
Applicant ──► / (waitlist form) ──► waitlist_applications (RLS: insert-only for the public)
Super admin ──► /admin ──► Approve ──► Supabase Auth user (temp password, must_change_password)
                                   └─► "Maligayang Pagdating sa Diskarte!" email (Resend)
Applicant ──► Diskarte /login ──► forced /reset-password ──► onboarding
```

## Develop

```bash
# from the repository root (npm workspace: one install for both apps)
npm install
cp early-access-portal/.env.example early-access-portal/.env   # EMAIL_TRANSPORT=log for local
npm run dev:portal                                              # http://localhost:3100  (admin: /admin)
npm test -w early-access-portal                                 # Vitest: anti-spam, guards, approvals, components
npm run admin:grant -- you@example.com                          # needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

The database lives in `../supabase/migrations/20260928000000_early_access.sql`, with RLS tests in `../diskarte/tests/db/early-access.test.ts`. The brand art in `public/brand` and `public/email` is exported from the Diskarte app's logo components by `npm run brand:assets` (repo root), and a test there fails if they drift.

## Layout

```
src/app/page.tsx                 landing + application form
src/app/actions.ts               public submission (rate limit → honeypot → signed token → Turnstile → Zod → RLS)
src/app/admin/…                  login, dashboard, review actions (super_admin re-checked in every action)
src/proxy.ts                     CSP nonce, per-IP limits, DB-checked /admin guard
src/lib/approvals.ts             approval workflow (dependency-injected; unit-tested)
src/lib/password.ts              CSPRNG temporary passwords matching Diskarte's policy
src/lib/email/                   branded HTML + text template, Resend / file / log transports
```

Vercel deployment, environment variables, domain routing and the admin bootstrap are covered in [DEPLOYMENT.md](DEPLOYMENT.md), and the security model in [../SECURITY.md](../SECURITY.md).
