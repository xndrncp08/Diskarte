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
- **Fast on cheap phones**: a virtualised chat stream (@tanstack/react-virtual). LiveKit and the emoji grid load on demand, which cuts the chat page's initial JavaScript by about 30%, and images are served as AVIF/WebP with blur placeholders.
- **Mobile-first**: a swipeable navigation drawer, 44 px touch targets, `100dvh` layouts with safe-area padding, and tap-to-reveal message actions.
- **Voice quality**: an 8-bit meter shows latency, packet loss and jitter, and whoever is speaking gets a neon glow.
- **Accessible**: keyboard navigation with visible focus, ARIA roles on menus, dialogs and tabs, a skip link, reduced-motion support, and axe-core audits in the test suite.
- **8-bit sound**: synthesised cues for joining, leaving, messages and mute toggles, with a volume control in the user panel.

### Community (Tambayan specials)

- **Soundboard**: 12 built-in 8-bit meme sounds (airhorn, ba dum tss, sad trombone…) plus up to 24 MP3 clips per tambayan uploaded by admins. Clips are broadcast over the LiveKit data channel, with per-sender cooldowns and a personal mute.
- **Support & boosts**: GCash / Maya numbers with copy buttons, boost levels, and admin-granted **Server Booster 🚀**, **Lodi Supporter 🏆** and **Gcash Contributor 💙** badges shown in the member list.
- **Pinoy sticker packs**: *Salitang Kanto* ("Sana All", "Charot!", "Petmalu"…) and *Tambayan Classics* (jeepney, halo-halo, kape, tsinelas).
- **LFG Board**: post a beacon ("Valorant, need 2, Gold+") with a party size, voice channel and expiry. **Join Party** takes one click and drops you straight into the voice channel.
- **Bantay-Bayan moderation**:
  - Auto-mod filters for spam and flooding, phishing (fake GCash/bank/Discord/Steam domains, IP loggers, punycode), hate speech and explicit content, plus custom words with leetspeak normalisation. Moderators are exempt.
  - Bans, and an audit log of joins/leaves, kicks, bans, role changes, deleted messages (with excerpts), channel edits, pins and auto-mod blocks.
  - Per-channel **slow mode** and **verified-accounts-only** channels.
- **Threads & reply chains**: move a discussion into a side-panel thread, with "N replies" chips on the root message.
- **Voice activities**:
  - A YouTube **watch party** (privacy-enhanced embed, synced play/pause/seek).
  - 8-bit **Tic-Tac-Toe** and **Pinoy Trivia** (timed rounds and a leaderboard).
  - Full-screen **focus mode** for screen shares.
- **Friends & DMs**: friend requests by `@username`, blocking, 1:1 and group DMs (up to 10) with voice calls. Only friends can start a DM, and blocking ends it.
- **Built for PH data**:
  - **Low-data mode** gives smaller images, tap-to-play GIFs and 360p/low-layer video.
  - An **offline outbox** keeps messages written without signal (surviving reloads) and sends them when you reconnect, under an 8-bit banner.

## Stack

Next.js 16 (App Router, React 19.2, Turbopack) · TypeScript · Tailwind CSS 4 · Framer Motion · Lucide · Supabase (Postgres, Auth, Realtime, Storage) · LiveKit (`livekit-client`, `@livekit/components-react`, `livekit-server-sdk`) · Zod · Vitest + Testing Library + PGlite · Playwright · Docker · Render · GitHub Actions

## Quick start

```bash
npm install
cp .env.example .env.local   # add Supabase + LiveKit credentials
npm run dev                   # http://localhost:3000
```

### Early Access portal

Before the public launch, sign-ups go through **[`early-access-portal/`](early-access-portal/README.md)**, a separate Next.js app in this repo:
- **Waitlist:** a public, bot-resistant form with retro confetti.
- **`/admin` dashboard:** for `super_admin`s. It has stats, search, filters, detail views and bulk approve/decline.
- **Approval:** creates the Diskarte account and emails a branded "Maligayang Pagdating sa Diskarte!" message with temporary credentials. The app then makes the user pick a new password on first login.

Set `SIGNUP_MODE=invite` on the main app to close public sign-up in the meantime.

For a free production deploy (Supabase + LiveKit Cloud + Render) and local Supabase/LiveKit, see **[DEPLOYMENT.md](DEPLOYMENT.md)**. The threat model, security controls and vulnerability reporting are in **[SECURITY.md](SECURITY.md)**.

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
