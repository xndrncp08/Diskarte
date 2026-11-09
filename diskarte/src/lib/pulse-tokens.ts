/**
 * Diskarte Pulse colour tokens: the single source of truth that src/app/pulse.css mirrors
 * (tests/ui/pulse-tokens.test.ts checks both the CSS values and every text/surface contrast pair).
 * Keys are the CSS custom-property names without the `--pulse-` prefix.
 */
export const PULSE_COLORS = {
  dark: {
    bg: "#121016",
    surface: "#1b1820",
    raised: "#24202b",
    line: "#312c39",
    "line-strong": "#443d4f",
    text: "#f2eee6",
    "text-muted": "#a8a2b3",
    "text-faint": "#8b8597",
    sun: "#ffb800",
    "on-sun": "#1a1300",
    "sun-ink": "#ffc93d",
    dagat: "#2cc8b4",
    gumamela: "#ff6b5e",
    ube: "#a68cf0",
    "presence-online": "#3ecf6e",
    "presence-idle": "#ffb800",
    "presence-dnd": "#ff6b5e",
    "presence-offline": "#8b8597",
  },
  light: {
    bg: "#f7f6f2",
    surface: "#ffffff",
    raised: "#efede7",
    line: "#e1ddd3",
    "line-strong": "#cfc9bc",
    text: "#1a1720",
    "text-muted": "#5f596a",
    "text-faint": "#7a7484",
    sun: "#ffb800",
    "on-sun": "#1a1300",
    "sun-ink": "#8a5a00",
    // Proposal values #0b7f72 / #c8352b nudged darker so they reach 4.5:1 on `raised` too.
    dagat: "#0a786b",
    gumamela: "#c4342a",
    ube: "#6a4fb3",
    "presence-online": "#1f8a4c",
    "presence-idle": "#a86b00",
    "presence-dnd": "#c4342a",
    "presence-offline": "#7a7484",
  },
} as const;

/**
 * Non-Solar themes recolour Pulse with `color-mix(in srgb, var(--color-sun) N%, <base>)`:
 * the ground gets a faint accent tint, and light mode darkens the accent for text.
 */
export const PULSE_THEME_MIX = { ground: 6, lightInk: 42 } as const;
