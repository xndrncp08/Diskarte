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
| `Menu`, `ContextMenu`, `PulseMenuSkin` | `ui/Menu`, `ui/ContextMenu` | `MenuSkinContext` provider (rows, groups, panel); wrap the Pulse shell root in `PulseMenuSkin` so reused Classic menus get the Pulse skin |
| `Dialog`, `Sheet` | `ui/Modal` | `useModalBehaviour` (overlay stack, focus, Tab trap, Escape, scroll lock, restore) and `useIsPhone` |
| `Card`, `BentoTile` | `PulseSurface` | composition |
| `Avatar`, `AvatarStack` | `SmartImage`, `SalakotAvatar`, `STATUS_LABELS` | composition |
| `NavItem`, `BottomTabBar` | `next/link`, `CountBadge`, `LiveIndicator` | composition |
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
  coloured leading mark, text stays `--pulse-text`). Control radius, not a pill: circles are for people.
- **`CountBadge`** `count`, `label` ("unread mentions"): screen readers hear "3 unread mentions", never a
  bare number. Shows `max+` above `max` (99). `tone`: `neutral` (default, plain counts), `alert` (mentions),
  `accent` only where the count means "new" or "selected".
- **`Kbd`** a key hint (`<kbd>`): `<Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>`; for a symbol pass `label` (`<Kbd label="Enter">↵</Kbd>`).
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
- **`NavItem`** a navigator row (Spaces, rooms, DMs): `label`, `secondary?`, `leading?` (Monogram, Avatar or
  icon; decorative), `href` (a link) or `onClick` (a button), `current` (`aria-current="page"`, tint, bold
  label with a sun underline, never a side pill), `unread` (dot, bold, ", unread" for screen readers),
  `count`/`countLabel`/`countTone`, `live` (true or a label such as "3 in voice"), `dimmed`. 44 px tall.
- **`BottomTabBar`** phone navigation: `label`, `items` (`href`, `label`, `icon`, `current?`, `count?`,
  `countLabel?`). A `<nav>` of links, not ARIA tabs; the current link has `aria-current="page"`, bold text
  and a sun bar. Pads for the home indicator; position it yourself.
- **`SegmentedControl`** `label`, `options` (`value`, `label`, `icon?`), `value`, `onChange`. A radio group:
  one tab stop, arrows move and select (wrapping), Home/End. The checked segment is raised, shadowed and bold.
- **`Toolbar`** `label`, `orientation?`, children (IconButtons, Buttons). `role="toolbar"` with roving
  tabindex: one tab stop that remembers the last control, arrows move (wrapping), Home/End, disabled skipped.

### Surfaces and overlays

- **`Card`** `title?`, `action?`, `raised?`. **`BentoGrid`** + **`BentoTile`** (`title`, `eyebrow?`,
  `span`: `one`, `wide`, `tall`, `hero`) for community pages; every tile is full width on phones.
- **`Dialog`** `open`, `onClose`, `title`, `description?`, `footer?`. Centred card on the scrim, for a
  decision or a short form. First focus goes to the first `[data-autofocus]` element, else the first
  focusable one (Close). Put `data-autofocus` on the field when typing is the point: a type-to-confirm
  dialog (`<Input label="Type the Space name to confirm" data-autofocus />`) or a rename form. Don't put it
  on a destructive button.
- **`Sheet`** same props. A side sheet from the right, or a bottom sheet (grabber, safe-area padding,
  keyboard-aware height) below 640 px. Use it for the Context sheet and other secondary panels.
- **`Menu`** / **`ContextMenu`** the Classic props (`label`, `items`, `trigger`; `useContextMenu`,
  `ContextMenuItems`). Keyboard focus is the selected tint plus the global focus outline (high contrast
  relies on that outline). The first keyboard open focuses the first row (or the checked choice) as soon
  as the panel is positioned (`useFloating` reports `ready`). **`PulseMenuSkin`** gives every menu below it
  the Pulse skin; the Pulse shell root wraps its tree in it so reused Classic menus match.
- **`Tooltip`** `label`, `side`. Visual only (`aria-hidden`); the trigger must name itself.

### People and Spaces

- **`Avatar`** a person, always a circle: `profile`, `size`, `status?`, `speaking?`, `labelled?`.
  Decorative unless `labelled` (then the name and status are its accessible name).
- **`Monogram`** a Space: a square tile with `rounded-pulse-monogram` (`--pulse-radius-monogram`, 7 px) and
  the initials or icon. Never a circle, and it never morphs on hover. `selected` adds the accent edge.
- **`AvatarStack`** `people` (profiles with optional `speaking`), `max` (4), `size`, `label?`. Overlapping
  circles with "+N"; a speaker gets a live-teal ring with a gap. One `role="img"` named by the people
  shown ("Juan (speaking), Maria and 3 more").
- **`PresenceDot`** `status`: online (disc), idle (crescent), dnd (barred disc), offline/invisible
  (ring), with the status name as the accessible name.

### Signals and states

- **`PulseLine`** the sun "new since" separator; `label` names it (`role="separator"`) and shows a pill.
  The travelling glint runs only under `pulse-motion`.
- **`LiveIndicator`** teal dot, ripple (motion only) and the word "Live" (`hideLabel` keeps it for screen readers).
- **`EmptyState`** `title`, body, `icon?` (in a neutral raised tile), `action?`, `headingLevel?`.
- **`ErrorState`** what happened (`title`), what to do (body), and Try again (`onRetry`, `retrying`). `role="alert"`.
- **`Skeleton`**, **`SkeletonRows`** (message-shaped, announced once), **`Loading`** (neutral spinner and visible text, `role="status"`).

## Do and don't

- **Do** use one `primary` Button per view. **Don't** use gold for decoration; it means "the next step",
  "new" or "selected" (empty-state tiles, spinners and plain counts stay neutral).
- **Do** pair every live, presence, mention or selected colour with a shape or words. **Don't** add a
  status that is only a colour.
- **Do** put long context in a `Sheet`, a decision in a `Dialog`. **Don't** open one over the other.
- **Do** use `Avatar` for people and `Monogram` for Spaces. **Don't** round a Space or square a person, and
  keep circles for people (chips and badges use the control radius).
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
renders every component in every state. `BentoGrid`/`BentoTile` have no screen yet; they stay documented
for community pages. `tests/browser/pulse-gallery.spec.ts` runs axe (WCAG 2.2 AA) in
both modes at 390 and 1280 px with the page, the dialog, the sheet, the menu and a toast open, checks for
horizontal overflow and the Tab order, and saves `test-results/pulse-gallery-*.png`. Unit tests are in
`tests/ui/pulse-components.test.tsx`.

```sh
cd diskarte && CI=1 npx playwright test --config playwright.experience.config.ts pulse-gallery
```

## Not yet

- Bricolage Grotesque and Figtree come from `next/font`, so the gallery (Vite) falls back to system fonts.
- The bottom sheet does not support drag-to-dismiss yet (Escape, the scrim and Close all work).
