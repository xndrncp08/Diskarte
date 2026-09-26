<p align="center">
  <img src="public/wordmark.svg" alt="Diskarte" height="72" />
</p>

<h3 align="center">Walang Shutdown-Shutdown: Ang Bagong Istambayan ng Bayan.</h3>

<p align="center">
  An open-source, self-hostable Discord alternative made for Filipino gamers, students and communities.<br/>
  Chat, voice, video and screen share, deployable for ₱0.
</p>

---

## Features

- **Tambayan (servers)**: create or join with shareable invite links, categorized text and voice channels, and Admin / Moderator / Member roles enforced in the database.
- **Real-time chat**: Supabase Realtime messaging with Markdown and highlighted code blocks, replies, inline edits, deletes, a pinned-messages drawer, typing indicators, and file/image attachments stored in a private bucket.
- **Pinoy reactions**: `:petmalu:`, `:lodi:`, `:sana_all:`, `:charot:`, `:canton:`… plus classic emoji.
- **Voice, video and screen share**: LiveKit WebRTC rooms with an adaptive grid, a screen-share focus layout, active-speaker rings, noise suppression, a floating call widget, and a draggable picture-in-picture HUD. Calls keep running while you browse other channels.
- **Profiles**: salakot mascot avatars, banners, bios, and Filipino status triggers ("Nagluto ng Canton", "AFK / Tulog", "LFG").
- **Look and feel**: Apple-style glass panels, a Discord multi-column layout, and 8-bit touches (pixel status dots, arcade signal bars, synthesized Web Audio sound effects).
- **Security**: RLS on every table, guard triggers, DB and app rate limiting, nonce-based CSP, CSRF checks, XSS-safe Markdown, and server-side LiveKit token minting.

## Stack

Next.js 16 (App Router, React 19.2, Turbopack) · TypeScript · Tailwind CSS 4 · Framer Motion · Lucide · Supabase (Postgres, Auth, Realtime, Storage) · LiveKit (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`) · Zod · Vitest + Testing Library + PGlite · Playwright · Docker · Render · GitHub Actions

## Quick start

```bash
npm install
cp .env.example .env.local   # add Supabase + LiveKit credentials
npm run dev                   # http://localhost:3000
```

For a free production deploy (Supabase + LiveKit Cloud + Render) and local Supabase/LiveKit, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js + React Compiler rules) |
| `npm run typecheck` | Route type generation + `tsc --noEmit` |
| `npm test` | Unit, component, hook, API route and database (RLS) tests with Vitest |
| `npm run test:e2e` | Playwright end-to-end suite (needs Supabase + LiveKit) |
| `npm run brand:assets` | Re-render favicons, app icons and OG cards from the SVG components |

## Project layout

```
src/
  app/                 routes: landing, (auth), (app)/tambayan, invite, settings, api/health, api/livekit/token
  actions/             server actions (profiles, servers/channels/members, messages)
  components/
    brand/             <DiskarteLogo />, <DiskarteWordmark />
    chat/              ChatView, MessageItem, Composer, PinsDrawer, EmojiPicker…
    voice/             CallProvider, VoiceStage, CallDock, FloatingCallHUD…
    server/ shell/     sidebar, member list, server rail, dialogs
    providers/         runtime config, presence, per-server realtime state
  hooks/               useChannelChat, useTyping, useSignedUrls…
  lib/                 env, security (CSP/CSRF), rate limiting, validation, sfx, supabase clients
  proxy.ts             CSP nonce, session refresh, auth redirects, CSRF for /api
supabase/migrations/   complete schema (tables, RLS, triggers, RPCs, realtime + storage policies)
tests/                 PGlite database tests, fixtures
e2e/                   Playwright specs
```

## Testing

- **Database**: the real migration runs inside PGlite, a WASM build of Postgres, behind a Supabase shim, and the RLS/RBAC rules are exercised as different users.
- **Unit/component**: Vitest + Testing Library cover the chat, voice, profile and server UI, plus the hooks, with a fake Supabase realtime client.
- **E2E**: Playwright covers sign-up and profile setup, server creation, channel switching and messaging, and joining a voice room with fake media devices.

## Branding

The logo and wordmark are hand-built inline SVG React components, so they stay sharp at every size. The wordmark uses glyph outlines from [Knewave](https://fonts.google.com/specimen/Knewave) by Tyler Finck (SIL Open Font License 1.1; see `assets/fonts/OFL-Knewave.txt`).
