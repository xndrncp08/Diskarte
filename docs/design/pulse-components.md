# Pulse components

The shared building blocks of Diskarte Pulse, in
[`src/components/pulse/`](../../diskarte/src/components/pulse/). They style only through the Pulse
tokens ([design system](../design-system.md#diskarte-pulse)), which the lint guard enforces, and they render
correctly only inside `<html data-shell="pulse">`. Classic is not affected by them.

**Reuse first.** Every Pulse component that has a Classic counterpart *wraps* it, so behaviour (focus,
keyboard, overlay stacking, placement) lives in one place. The Classic primitives accept a typed *skin*:
a set of class strings that replaces their look and nothing else. Classic passes nothing and renders exactly as before.

| Pulse | Reuses | How |
| --- | --- | --- |
| `Button`, `IconButton` | `ui/Button` | `useMinimumLoading` (spinner held ≥ 300 ms) |
| `Input`, `Textarea`, `Select` | `ui/Field` | `InputField` / `TextareaField` / `FieldShell` with `skin={PULSE_FIELD}` |
| `Switch` | `ui/Switch` | `skin` (`SwitchSkin`) |
| `Tooltip` | `ui/Tooltip` | `tipClassName` |
| `Menu`, `ContextMenu` | `ui/Menu`, `ui/ContextMenu` | `MenuSkinContext` provider (rows, groups, panel) |
| `Dialog`, `Sheet` | `ui/Modal` | `useModalBehaviour` (overlay stack, focus, Tab trap, Escape, scroll lock, restore) and `useIsPhone` |
| `Card`, `BentoTile` | `PulseSurface` | composition |
| `Avatar` | `SmartImage`, `SalakotAvatar`, `STATUS_LABELS` | composition |
| Toasts | `AppToaster` (Sonner) | swaps in `PULSE_TOAST_CLASSES` while the shell is Pulse; call `toast()` as usual |

`cn()` knows the Pulse type, radius, shadow and font names (`lib/utils.ts`), so `text-pulse-body
text-pulse-text` keeps both the size and the colour.

## Contracts

Each file's JSDoc header is the full contract; this is the summary.

### Actions

- **`Button`** `variant`: `primary` (the one solar-gold action per view, on-accent text), `secondary`
  (outlined, default), `quiet` (text only), `danger` (on-alert text), `live` (joins or controls voice,
  on-live text). `size`: `sm` 32, `md` 40, `lg` 48 px; all are at least 44 px tall on coarse pointers (a
  real box, not a pseudo hit area). `loading` shows a spinner, disables and sets `aria-busy`. `icon` is a
  decorative leading icon. Pressing scales to 0.97 only under the `pulse-motion` variant.
- **`IconButton`** `label` (required, becomes `aria-label`), `icon`, optional `tooltip`. Defaults to
  `quiet`. An empty label is reported with `console.error` outside production.

### Labels and counts

- **`Chip`** a tag. Static; with `onClick` a toggle button (`selected` → `aria-pressed`); with
  `onRemove` a "Remove {name}" button. `tone`: neutral, accent, live, alert, people (tinted surface,
  coloured leading mark, text stays `--pulse-text`).
- **`CountBadge`** `count`, `label` ("unread mentions"): screen readers hear "3 unread mentions", never a
  bare number. Shows `max+` above `max` (99).
- **`StatusBadge`** tinted pill with a mark or `icon` and the status as text.

### Forms

- **`Input`**, **`Textarea`**, **`Select`** `label` (required), `hint`, `error`. Edges use
  `--pulse-input-border` (3:1); the error replaces the hint, turns the edge alert and is announced
  (`role="alert"`, linked by `aria-describedby`). `Select` is native, so phones get their own picker.
- **`Switch`** `checked`, `onChange`, `label`, `hint`, `disabled`. `role="switch"`; on is the accent-mark
  track, off an outlined track, and the knob position is the non-colour cue. On touch the 24 px track is a
  real 44 px box (transparent border). Disabled keeps readable text and greys the track.

### Navigation

- **`Tabs`** `label`, `items` (`id`, `label`, `badge?`, `disabled?`), `value`, `onChange`, `children`
  (the active panel). APG tabs with automatic activation: one tab stop, ←/→ (wrapping), Home/End,
  disabled tabs skipped, `aria-selected`, `aria-controls` → `role="tabpanel"`. The selected tab has a
  solar underline *and* bold text. The strip scrolls sideways on narrow screens.

### Surfaces and overlays

- **`Card`** `title?`, `action?`, `raised?`. **`BentoGrid`** + **`BentoTile`** (`title`, `eyebrow?`,
  `span`: `one`, `wide`, `tall`, `hero`) for community pages; every tile is full width on phones.
- **`Dialog`** `open`, `onClose`, `title`, `description?`, `footer?`. Centred card on the scrim, for a
  decision or a short form.
- **`Sheet`** same props. A side sheet from the right, or a bottom sheet (grabber, safe-area padding,
  keyboard-aware height) below 640 px. Use it for the Context sheet and other secondary panels.
- **`Menu`** / **`ContextMenu`** the Classic props (`label`, `items`, `trigger`; `useContextMenu`,
  `ContextMenuItems`). Keyboard focus is the selected tint plus a gold start bar.
- **`Tooltip`** `label`, `side`. Visual only (`aria-hidden`); the trigger must name itself.

### People and Spaces

- **`Avatar`** a person, always a circle: `profile`, `size`, `status?`, `speaking?`, `labelled?`.
  Decorative unless `labelled` (then the name and status are its accessible name).
- **`Monogram`** a Space: a square tile with a 7 px radius and the initials or icon. Never a circle,
  and it never morphs on hover. `selected` adds the accent edge.
- **`PresenceDot`** `status`: online (disc), idle (crescent), dnd (barred disc), offline/invisible
  (ring), with the status name as the accessible name.

### Signals and states

- **`PulseLine`** the sun "new since" separator; `label` names it (`role="separator"`) and shows a pill.
  The travelling glint runs only under `pulse-motion`.
- **`LiveIndicator`** teal dot, ripple (motion only) and the word "Live" (`hideLabel` keeps it for screen readers).
- **`EmptyState`** `title`, body, `icon?`, `action?`, `headingLevel?`.
- **`ErrorState`** what happened (`title`), what to do (body), and Try again (`onRetry`, `retrying`). `role="alert"`.
- **`Skeleton`**, **`SkeletonRows`** (message-shaped, announced once), **`Loading`** (spinner and visible text, `role="status"`).

## Do and don't

- **Do** use one `primary` Button per view. **Don't** use gold for decoration; it means "the next step".
- **Do** pair every live, presence, mention or selected colour with a shape or words. **Don't** add a
  status that is only a colour.
- **Do** put long context in a `Sheet`, a decision in a `Dialog`. **Don't** open one over the other.
- **Do** use `Avatar` for people and `Monogram` for Spaces. **Don't** round a Space or square a person.
- **Don't** add floating hover toolbars or a server rail: Pulse is not Discord. Actions live in menus,
  context menus and the Context sheet.
- **Don't** reach for Classic tokens, `slate-*`, `white`/`black` or hex colours in `components/pulse`; the
  lint guard fails the build.

## Motion

`pulse-motion:` (in `pulse.css`) applies only when the OS allows motion *and* Settings → Accessibility
"Reduced motion" is off. Ambient loops (`animate-pulse-travel`, `animate-pulse-ripple`) and the press scale
use it. Dialog and Sheet use framer-motion, which follows the app's `MotionConfig` (opacity only under reduced motion).

## Visual review

`/pulse-gallery` in the browser fixture (`tests/browser/pulse-gallery.tsx`, `?mode=light` for paper)
renders every component in every state. `tests/browser/pulse-gallery.spec.ts` runs axe (WCAG 2.2 AA) in
both modes at 390 and 1280 px with the page, the dialog, the sheet, the menu and a toast open, checks for
horizontal overflow and the Tab order, and saves `test-results/pulse-gallery-*.png`. Unit tests are in
`tests/ui/pulse-components.test.tsx`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-gallery
```

## Not yet

- Bricolage Grotesque and Figtree come from `next/font`, so the gallery (Vite) falls back to system fonts.
- The bottom sheet does not support drag-to-dismiss yet (Escape, the scrim and Close all work).
