# Platform experience redesign

This change builds on the existing public branding and authentication work at `dbeae29`. It preserves the Next.js app, Supabase authorization, LiveKit calls, routes, original brand assets and desktop floating workspace.

## Delivered experience

| Area | Implementation |
| --- | --- |
| Public landing | Editorial hero, original salakot mascot and existing Electric Logo, interactive chat/voice/workspace preview, asymmetric feature compositions, connected workspace section, Filipino identity story, closing sign-in form and responsive navigation. |
| Story and claims | Diskarte as resourcefulness, creativity and belonging. Showcases existing messaging, threads, media, events, discovery, voice/video/screen sharing, profiles, themes, notes, boards, resources, whiteboards, focus sessions and PWA support. Sample preview content is explicitly labelled; no adoption claims or testimonials. |
| Design system | Semantic surface, stroke, text and accent tokens inherit all existing palettes and light/dark/system modes. Shared controls, focus treatment, glass materials, headers, menus, overlays, empty states, toast surfaces and motion timing. Gold text gets an accessible light-mode variant. |
| Desktop shell | Consistent gutters, rounded workspace surfaces, navigation hierarchy and shared header treatment. Floating panel behavior, saved layouts and resizing remain in the existing workspace system. |
| Messaging | Refined grouped messages, sender hierarchy, reaction chips, action toolbar, composer focus/send treatment, channel/DM/thread headers and conversation list. Adds a real unread filter. Existing virtualization, drafts, attachments, voice recording, GIFs, replies, reactions and authorization remain in place. |
| Mobile/PWA | Focused conversation screens, clearer destination bar and call strip, separate social tabs, full-screen workspace editors, 16px phone inputs and reduced nested blur. Existing safe-area, visual-viewport keyboard sizing, drawer focus/back/swipe behavior, call persistence and service-worker logic are preserved. |
| Smart Tambay | Authorized memberships, recent conversations, unread counts, friend requests, channel mentions, upcoming/ongoing events, active voice room previews, current call and shared-workspace links. Existing create/join/add-friend actions and truthful empty/error/loading states. |
| Voice/video | Refined lobby and control surfaces, coordinated stage controls and a stable active-speaker ring in place of continuously animated large shadows. Existing LiveKit state, devices, permissions, sharing and mini-call behavior remain in place. |
| Profiles/social | Coordinated profile card materials and friend rows; friend search by name/username, accessible roving tabs and mobile hierarchy. Existing requests, privacy, block/report and profile editing controls remain functional. |
| User settings | Searchable sections with icons, keyboard navigation, focused desktop/mobile layouts. Separates My Account, Devices & Sessions, Storage & Data and documented built-in keybinds. Reuses real sign-out, MFA, export, PWA, notification, appearance and accessibility controls; no simulated device list or settings. |
| Discovery/admin | Refined community cards and keyboard-operable category filters. Community settings use a desktop sidebar/mobile tab strip, identity header and coordinated content panels. Role-based tab visibility, moderation, roles, invitations, audit logs and destructive confirmations are preserved. |
| Collaboration | Coordinated document library, type filter, full-screen mobile note/board/focus/resource/whiteboard editors and confirmation before discarding unsaved document edits. Existing revision checks, permission loss handling and conflict resolution remain in place. |
| Activity | Unified Inbox/Mentions/Saved tabs, channel mention deep links, requests, unread DMs and bulk read actions. Uses the shared authoritative unread providers. |

The smaller existing interfaces receive the shared component/material treatment; their domain logic was not rewritten for visual completeness. Super Admin remains in its existing architecture with the shared control improvements.

## Notification correctness

- Request generations prevent older channel/DM fetches from overwriting a newer response or updating an unmounted subscriber.
- Existing durable local read marks continue to protect optimistic reads while receipts are in flight.
- Replayed mentions consult the server receipt before making a sound or desktop alert.
- DM delivery rechecks current read state after its asynchronous preview arrives.
- Bulk channel reads are queued durably until acknowledged. Acknowledgment cannot remove a newer receipt.
- Intentional Mark Unread cancels queued reads and waits for earlier read requests before sending the rewind. Remote rewinds remain observable.
- Existing server-side push/read-state safeguards and RLS migrations are unchanged and exercised by the database suite.

## Accessibility and motion

Visible focus, labelled fields, keyboard-operable tabs/filters, linked tab panels, reduced motion and reduced transparency are retained or improved. Automated contrast findings in the new light-mode surfaces were corrected. The Electric Logo stays exclusive to the public hero, with the original static image, pause control, offscreen/background teardown and low-power/mobile fallback.

Automated checks are evidence for the tested surfaces, not a blanket accessibility certification. Manual screen-reader and physical-device assessment remain necessary.

## Validation

Run from the app directory:

```sh
npm run lint
npm run typecheck
npm test -- --maxWorkers=3
npm run build
npm run test:experience
npx playwright test e2e/smoke.spec.ts e2e/public-auth.spec.ts e2e/landing-experience.spec.ts e2e/pwa.spec.ts
```

- Baseline: 146 test files / 876 tests and production build passed.
- Updated unit/component/database suite: 147 files / 887 tests passed.
- Production public suite: 31 browser tests covering landing interactions, authentication validation/navigation, CSP and API protections, reduced motion and Electric Logo lifecycle, offline cache isolation, push deduplication and layout stability.
- Isolated signed-in browser suite: 13 tests using real application components with fixture data and disabled server actions. Covers home, chat, conversations, discovery, friends, voice lobby, user/community settings and workspaces. These are component-browser tests, not proof of live backend behavior.
- Requested widths: 320, 375, 390, 430, 768, 1024 and 1440px. Includes focus, overflow, composer visibility under viewport resizing, filters, keyboard navigation, light/dark automated accessibility and mobile editor sizing. Floating panels are exercised with keyboard movement/resizing and desktop/mobile transitions while retaining the composer draft.
- GitHub CI retains the existing Docker and live Supabase/LiveKit E2E jobs and adds the responsive component-browser suite. The linked workflow run is the authority for remote results.

Screenshots and failure traces are written under `test-results/`; they contain labelled fixture/sample data and are not production assets. Public tests can run against the standalone build with `E2E_BASE_URL` and test-only runtime configuration.

## Performance

No runtime dependencies were added. The Electric Logo and heavier existing call/settings components retain their lazy boundaries. The new static workspace showcase renders on the server. Mobile nested glass avoids additional backdrop blur; call speaking indicators no longer repaint animated large shadows.

Aggregate emitted chunks from `.next/static/chunks`, measured with the same gzip method before and after:

| Metric | Baseline | Updated |
| --- | ---: | ---: |
| JavaScript chunks | 86 | 83 |
| JavaScript bytes | 3,661,719 | 3,685,513 |
| Gzipped JavaScript bytes | 1,137,173 | 1,143,581 |
| CSS bytes | 134,000 | 175,553 |

Aggregate gzipped JavaScript increases by 6,408 bytes (0.56%). CSS increases by 41,553 uncompressed bytes for the broader visual system. These totals cover all emitted chunks, **not** initial route download size, startup time or field performance. One local Chromium run with reduced motion recorded CLS 0, LCP 116ms and TTFB 28.3ms. Those measurements do not represent production networks or mobile GPU/battery performance.

## Limits and preserved work

- The verified transparent original mascot is retained. The earlier Canva candidate contains a checkerboard; a transparent export required unavailable paid access. No new Canva export is claimed or substituted.
- Authentication retains the original implementation from the preceding redesign. No licensed React Bits Pro source is copied.
- This machine has no Docker, Supabase CLI or LiveKit server. Live service journeys are delegated to the existing GitHub CI environment, not represented by fixtures.
- Browser coverage uses Chromium emulation. Physical iOS/Android devices, Safari, installed OS keyboard behavior, vendor OAuth delivery and real camera/microphone hardware were not locally tested.
- No database migrations, authentication services, API permission rules or product automation features are added.
- Existing root `package.json` edits, `.agents/`, `.codex/` and `diskarte/scripts/_preview.tsx` remain outside the redesign commits.

Development branch: `feat/platform-experience`. Integration target: `main`. Conventional commits separate foundations, landing, notification correctness, application refinement and regression coverage. Existing published history is preserved.
