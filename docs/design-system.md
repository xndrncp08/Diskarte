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

## Reuse guidelines

1. Use `components/ui` primitives and semantic tokens; don't hard-code colours that themes or light
   mode should change.
2. New overlays go through `Modal`/`FloatingWindow`/`Popover` so focus, Escape and stacking work.
3. Heavy panels load lazily (`next/dynamic` or `import()`), with a skeleton.
4. Check new UI in light mode, at 320 px width, with reduced motion and keyboard only.
5. Never use emoji in UI chrome; add a glyph to `lib/glyphs.ts` instead.
