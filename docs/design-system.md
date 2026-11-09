# UI, UX and design system

## Identity

Diskarte's look is **Solar Gold on Midnight Navy glass** with 8-bit touches: pixel status badges,
arcade signal bars, stepped "arcade" easing and synthesized chiptune sound cues. The mascot is a
character in a **salakot** (the traditional wide-brimmed hat); default avatars are recoloured
salakot mascots. Copy is English with Filipino flavour (status triggers like "Nagluto ng Canton",
community names like *Tambayan* and *Bantay-Bayan*); core navigation and settings can be shown in
Filipino.

| Asset | Source |
| --- | --- |
| Logo and wordmark | Inline SVG React components ([`components/brand/`](../diskarte/src/components/brand)); the wordmark uses glyph outlines from [Knewave](https://fonts.google.com/specimen/Knewave) by Tyler Finck (SIL OFL 1.1, `diskarte/assets/fonts/OFL-Knewave.txt`) |
| App icons, favicons, OG images | Rendered from the SVG components by `npm run brand:assets` |
| Landing hero | Static mascot image with an optional WebGL "electric" logo, paused off-screen, disabled for reduced motion and low-power/mobile |

The UI never draws emoji. Reactions, status icons, badges, sounds and activities are `:code:` strings
rendered as vector icons by [`<Glyph>`](../diskarte/src/components/ui/Glyph.tsx)
([`lib/glyphs.ts`](../diskarte/src/lib/glyphs.ts)), so they look the same on every platform.

## Typography

| Token | Font | Use |
| --- | --- | --- |
| `--font-sans` | Inter | Everything by default |
| `--font-pixel` | Press Start 2P | Retro headings and badges, sparingly |
| `--font-silk` | Silkscreen | Small pixel labels (role chips, counters) |
| `--font-mono` | JetBrains Mono | Code blocks and inline code |

Fonts are self-hosted through `next/font/google` with `display: swap`. Phone inputs are 16 px so iOS
doesn't zoom on focus.

## Colour tokens

Base palette in the Tailwind `@theme` block of [`globals.css`](../diskarte/src/app/globals.css):

| Token | Dark (default) | Role |
| --- | --- | --- |
| `--color-sun` / `--color-sun-deep` | `#ffb800` / `#f59e0b` | Accent (the theme recolours this) |
| `--color-midnight` | `#0f172a` | Panels |
| `--color-abyss` | `#020617` | Page background |
| `--color-panel`, `--color-onyx` | `#111827`, `#1e1f22` | Raised surfaces |
| `--color-neon` | `#06b6d4` | Secondary accent |
| `--color-bayan-blue`, `--color-bayan-red` | `#0038a8`, `#ce1126` | Philippine flag colours for brand moments |
| `--color-signal-*` | green `#10b981`, idle `#f59e0b`, custom `#3b82f6`, dnd `#ef4444`, offline `#64748b` | Presence |

Semantic tokens in [`experience.css`](../diskarte/src/app/experience.css) derive from those, so every
theme and colour mode inherits them:

| Group | Tokens |
| --- | --- |
| Surfaces | `--surface-base`, `--surface-panel`, `--surface-raised`, `--surface-frost`, `--surface-hover` |
| Strokes | `--stroke`, `--stroke-strong` |
| Text | `--text-primary`, `--text-secondary`, `--text-muted`, `--text-accent` |
| Accent | `--accent-soft` |
| Shape | `--radius-control` (0.75 rem), `--radius-panel` (1.25 rem) |
| Depth | `--shadow-panel`, `--shadow-overlay` |
| Motion | `--duration-press` (120 ms), `--duration-ui` (180 ms), `--ease-out-quint`, `--ease-arcade` (`steps(4, end)`) |

**Prefer semantic tokens** in new UI; reach for palette tokens only for brand moments.

### Themes and colour modes

| Theme | Accent | Base |
| --- | --- | --- |
| Solar (default) | `#ffb800` | `#0f172a` |
| Bayan | `#60a5fa` | `#0c1a3a` |
| Neon | `#22d3ee` | `#071a22` |
| Ube | `#c4b5fd` | `#1a1033` |
| Sampaguita | `#f9a8d4` | `#24101d` |
| Kalikasan | `#4ade80` | `#0b1f17` |

Themes are `html[data-theme=…]` overrides; colour mode is `html[data-color-mode="dark|light"]`
(system mode resolves with a tiny nonce'd inline script before paint). Both come from cookies, so
the server renders the right colours on the first byte — no flash, no client-only attributes. Light
mode remaps surfaces and text and darkens gold text for contrast (`--text-accent`).

## Glass and surfaces

Glass is used for floating layers (dialogs, menus, the auth card): translucent navy, a hairline white
border and backdrop blur (`GLASS_CARD` in [`BrandStage.tsx`](../diskarte/src/components/brand/BrandStage.tsx)).
Rules: no glass on glass on phones (nested blur is expensive), **Reduce transparency** replaces blur
with solid surfaces, and text on glass must still meet contrast in both modes.

## Component library

Shared primitives in [`components/ui/`](../diskarte/src/components/ui) — use these before writing new
ones:

| Component | Use |
| --- | --- |
| `Button` | Variants `primary`, `secondary`, `ghost`, `danger`, `glass`; sizes `sm`, `md`, `lg`, `icon`; a `loading` spinner that stays ≥ 300 ms once shown (no flash) |
| `Field`, `Switch` | Labelled inputs with hints/errors (password eye toggle); pixel-knob `role="switch"` |
| `Modal` | Accessible dialog: portal, focus trap, Escape/backdrop close, focus restore |
| `FloatingWindow` | Centred dialog for Settings, server settings, mixer, media and profiles; lazy bodies with `WindowSkeleton` |
| `Popover`, `Menu`, `ContextMenu`, `Tooltip` | Portalled to `<body>` with collision-aware placement ([`floating.tsx`](../diskarte/src/components/ui/floating.tsx)); context menus also open on long-press |
| `ConfirmDialog` / `ConfirmHost` | Confirmation for destructive actions started from menus (the menu unmounts, the host stays) |
| `EmptyState`, `PageHeader` | Consistent empty screens and page titles |
| `SmartImage` | `next/image` for optimizable hosts (AVIF/WebP, per-device sizes, low-data quality), `<img>` otherwise, with a navy→gold blur placeholder |
| `Glyph`, `Emote` | Icon vocabulary and custom server emoji |
| `InertWhenExiting` | Overlays stop taking clicks and leave the accessibility tree as soon as they start exiting |

[`overlay-stack.ts`](../diskarte/src/components/ui/overlay-stack.ts) tracks open overlays so only the
topmost one answers Escape and traps Tab.

## Layout

```text
Desktop (≥ md)                                     Phone
┌────┬──────────┬──────────────────────┬───────┐   ┌──────────────────────┐
│rail│ channels │ main (chat / voice / │members│   │ screen (full width)  │
│    │ / DMs    │ workspace / explore) │ (opt) │   │                      │
│    │ ⇔ resize │                      │⇔resize│   │ call strip (if any)  │
│    │ user pnl │                      │       │   ├──────────────────────┤
└────┴──────────┴──────────────────────┴───────┘   │ Home Messages Explore│
                                                   │ Profile   (tab bar)  │
                                                   └──────────────────────┘
```

- **Desktop**: Discord-style columns with resizable dividers (drag, arrow keys, Home/End, double-click
  to reset), a toggleable member list, widths saved per browser
  ([`WorkspaceProvider`](../diskarte/src/components/workspace/WorkspaceProvider.tsx),
  [`ResizeHandle`](../diskarte/src/components/workspace/ResizeHandle.tsx)). An optional floating-panel
  mode on wide screens lets the channel list and main panel be moved and resized.
- **Phone**: tab bar (Home, Messages, Explore, Profile) on top-level screens; conversations take the
  whole screen; the navigation drawer opens with an edge swipe; a persistent call strip while in a
  call ([`MobileNavigation`](../diskarte/src/components/shell/MobileNavigation.tsx)).
- **Installed PWA**: safe-area padding (`viewport-fit=cover`), status bar colour follows the colour
  mode, keyboard-aware height ([`useAppViewport`](../diskarte/src/hooks/useAppViewport.ts)).
- **Ctrl/Cmd + K** opens a command palette for channels, conversations and destinations.

## Motion

- Framer Motion for enter/exit and layout; CSS transitions for hovers and presses using
  `--duration-press` / `--duration-ui` and `--ease-out-quint`.
- 8-bit flourishes use `--ease-arcade` (stepped) sparingly.
- **Reduced motion** (system or Settings → Accessibility) removes non-essential animation; counters
  jump instead of counting, the landing WebGL scene is replaced by the static image.
- Speaking indicators are a stable ring, not continuously animated large shadows (cheaper to paint).

## Accessibility

| Practice | Implementation |
| --- | --- |
| Keyboard | Every control reachable; roving tabs with arrow/Home/End; resizable columns and floating panels operable by keyboard; skip link to `<main>` |
| Focus | Visible focus rings; dialogs trap focus and restore it to the opener as soon as dismissal starts |
| Semantics | ARIA roles for menus, dialogs, tabs, switches; tooltips are `aria-hidden` (triggers keep their names) |
| Forms | Labels on every field; server errors focus the first invalid field, even above a mobile keyboard ([`useFormErrorFocus`](../diskarte/src/components/auth/useFormErrorFocus.ts)) |
| Touch | 44 px minimum targets on coarse pointers |
| Preferences | Reduced motion, reduced transparency, high contrast, underlined links, chat font size 12–20 px |
| Testing | axe-core in Vitest (`tests/a11y/axe.test.tsx`) and Playwright (`e2e/a11y.spec.ts`), light and dark |

Automated checks are evidence for the tested screens, not certification; manual screen-reader and
device testing has not been done.

## UI state conventions

| State | Convention |
| --- | --- |
| Loading | Skeletons for panels and call stages; a channel's `loading.tsx` fades in only after a beat so fast loads don't flash |
| Empty | `EmptyState` with a short explanation and the next action |
| Error | Specific, actionable toasts ("Slow mode — you can send again in 5s"); unavailable features say why (missing setup, permission, connection) instead of a generic failure |
| Optimistic | Show immediately, mark pending, roll back with a toast on failure |
| Destructive | Confirm through `ConfirmHost`; typed confirmation for account deletion |
| Toasts | Sonner, bottom-right on desktop (above the call tray), top on phones so they don't cover the composer |

## Diskarte Pulse

Pulse is the redesign (Direction A, "Canvas": Spaces navigator, Conversation Canvas, Context sheet)
in warm ink (dark) or paper (light) with a solar gold signature. It is built alongside Classic and
reached per browser through the shell preference ([ADR 016](architecture/decisions.md#016-pulse-ships-behind-a-per-browser-shell-preference)).
This section covers the groundwork: tokens, fonts and the lint guard. No Pulse screen exists yet.

### Scoping: Classic is untouched

- The `diskarte-shell` cookie (`classic` default, `pulse`) is read by the root layout, which renders
  `<html data-shell="classic|pulse">` on the first byte ([`lib/shell.ts`](../diskarte/src/lib/shell.ts)).
- Every token lives in [`pulse.css`](../diskarte/src/app/pulse.css) under `html[data-shell="pulse"]`,
  so Classic computes exactly the same styles as before. The Tailwind aliases (`bg-pulse-surface`…) are
  `@theme inline`, so they only resolve inside Pulse.
- `setShell(shell, router)` flips the attribute, saves the cookie and calls `router.refresh()`; no
  reload, so a live call, open chats and drafts survive the switch. There is no visible toggle yet.

### Colour tokens

Hexes come from [`lib/pulse-tokens.ts`](../diskarte/src/lib/pulse-tokens.ts), the source of truth
that `pulse.css` mirrors. Components use the semantic tokens; palette names (`--pulse-sun`,
`--pulse-dagat`…) are for the token file only.

| Token | Tailwind | Dark | Light | Role |
| --- | --- | --- | --- | --- |
| `--pulse-bg` | `bg-pulse-bg` | `#121016` | `#f7f6f2` | Ground |
| `--pulse-surface` | `bg-pulse-surface` | `#1b1820` | `#ffffff` | Panels, the canvas |
| `--pulse-raised` | `bg-pulse-raised` | `#24202b` | `#efede7` | Cards, hovers, inputs |
| `--pulse-line` / `--pulse-line-strong` | `border-pulse-line` / `-line-strong` | `#312c39` / `#443d4f` | `#e1ddd3` / `#cfc9bc` | Dividers, control borders |
| `--pulse-text` | `text-pulse-text` | `#f2eee6` | `#1a1720` | Body text |
| `--pulse-text-muted` | `text-pulse-muted` | `#a8a2b3` | `#5f596a` | Secondary text |
| `--pulse-text-faint` | `text-pulse-faint` | `#8b8597` | `#7a7484` | Icons and disabled marks only (3:1, not for text) |
| `--pulse-accent` | `bg-pulse-accent` | `#ffb800` | `#ffb800` | Solar gold fills |
| `--pulse-on-accent` | `text-pulse-on-accent` | `#1a1300` | `#1a1300` | Text on accent fills |
| `--pulse-accent-ink` | `text-pulse-accent-ink` | `#ffc93d` | `#8a5a00` | Accent-coloured text and links |
| `--pulse-live` (dagat) | `text-pulse-live` | `#2cc8b4` | `#0a786b` | Live, voice |
| `--pulse-alert` (gumamela) | `text-pulse-alert` | `#ff6b5e` | `#c4342a` | Mentions, danger |
| `--pulse-people` (ube) | `text-pulse-people` | `#a68cf0` | `#6a4fb3` | People, roles |
| `--pulse-focus-ring` | `ring-pulse-focus` | `#ffc93d` | `#8a5a00` | Focus outline |
| `--pulse-presence-*` | `bg-pulse-online`, `-idle`, `-dnd`, `-offline` | `#3ecf6e`, `#ffb800`, `#ff6b5e`, `#8b8597` | `#1f8a4c`, `#a86b00`, `#c4342a`, `#7a7484` | Presence dots |

Every text token reaches **4.5:1** on `bg`, `surface` and `raised` in both modes, and presence and
faint marks reach 3:1; [`tests/ui/pulse-tokens.test.ts`](../diskarte/tests/ui/pulse-tokens.test.ts)
computes the ratios and checks `pulse.css` still matches the TypeScript values. The light dagat and
gumamela are a shade darker than the first proposal (`#0b7f72`, `#c8352b`) so they pass on `raised`.

**Themes.** Solar keeps the palette above. The other five themes recolour the accent to
`--color-sun` and tint the ground with 6 % of it; in light mode accent text is the theme colour mixed
42 % into the text colour. The same test checks contrast for every theme in both modes.

### Type, shape, depth and motion

| Group | Tokens |
| --- | --- |
| Fonts | `font-display` Bricolage Grotesque 500/700/800 (`--pulse-font-display`); `font-text` Figtree 400–700 (`--pulse-font-text`, the Pulse body font) |
| Type scale | `text-pulse-caption` 12/16, `-label` 13/18, `-body` 15/22, `-lead` 17/24, `-title` 20/26, `-heading` 24/30, `-display` 32/38, `-hero` 44/48 (`--pulse-size-N` / `--pulse-leading-N`) |
| Radius | `rounded-pulse-control` 6 px, `-item` 10 px, `-card` 16 px, `-sheet` 24 px |
| Elevation | `shadow-pulse-1`, `-2`, `-3` (`--pulse-elevation-N`, softer in light mode) |
| Motion | `--pulse-dur-press` 120 ms, `--pulse-dur-ui` 200 ms, `--pulse-dur-sheet` 320 ms, `--pulse-dur-loop` 1.6 s (live pulse), `--pulse-ease` out-quint |
| Spacing | 4 px grid: Tailwind's spacing already matches; `--pulse-space-1…16` for raw CSS |

Both fonts load through `next/font/google` with `display: swap`, the Latin subset, metric-adjusted
fallbacks and `preload: false`: Classic never renders them, so Classic visitors don't download them.
When Pulse becomes the default, switch preloading on.

### Lint guard

Files in `src/components/pulse/` may not use `slate-*`, `gray-*`, `white` or `black` colour utilities
or arbitrary `[#hex]` colours (`no-restricted-syntax` in
[`eslint.config.mjs`](../diskarte/eslint.config.mjs)); the error points here.
[`PulseSurface`](../diskarte/src/components/pulse/PulseSurface.tsx) is the token-only reference and
[`tests/ui/pulse-lint.test.ts`](../diskarte/tests/ui/pulse-lint.test.ts) proves the rule fires.

## Reuse guidelines

1. Use `components/ui` primitives and semantic tokens; don't hard-code colours that themes or light
   mode should change.
2. New overlays go through `Modal`/`FloatingWindow`/`Popover` so focus, Escape and stacking work.
3. Heavy panels load lazily (`next/dynamic` or `import()`), with a skeleton.
4. Check new UI in light mode, at 320 px width, with reduced motion and keyboard only.
5. Never use emoji in UI chrome; add a glyph to `lib/glyphs.ts` instead.
