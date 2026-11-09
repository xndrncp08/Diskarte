// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PULSE_COLORS, PULSE_THEME_MIX } from "@/lib/pulse-tokens";
import { THEMES } from "@/lib/theme";

const css = fs.readFileSync(path.join(__dirname, "../../src/app/pulse.css"), "utf8");
const SELECTOR = { dark: 'html[data-shell="pulse"]', light: 'html[data-shell="pulse"][data-color-mode="light"]' } as const;

function block(selector: string) {
  const match = new RegExp(`(?:^|\\n)${selector.replace(/[[\]"()]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`pulse.css has no ${selector} block`);
  return match[1];
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2 contrast ratio. */
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** `color-mix(in srgb, a pct%, b)`. */
const mix = (a: string, pct: number, b: string) => rgb(a).map((v, i) => (v * pct + rgb(b)[i] * (100 - pct)) / 100);

const TEXT = ["text", "text-muted", "sun-ink", "dagat", "gumamela", "ube"] as const;
const NON_TEXT = ["text-faint", "presence-online", "presence-idle", "presence-dnd", "presence-offline"] as const;
const SURFACES = ["bg", "surface", "raised"] as const;

describe("Pulse tokens", () => {
  it.each(["dark", "light"] as const)("pulse.css mirrors the %s palette in pulse-tokens.ts", (mode) => {
    const declared = block(SELECTOR[mode]);
    for (const [name, hex] of Object.entries(PULSE_COLORS[mode])) expect(declared, `--pulse-${name}`).toContain(`--pulse-${name}: ${hex};`);
  });

  it.each(["dark", "light"] as const)("every %s text/surface pair reaches 4.5:1 (UI marks 3:1)", (mode) => {
    const c = PULSE_COLORS[mode];
    const failures: string[] = [];
    for (const surface of SURFACES) {
      for (const fg of TEXT) if (contrast(rgb(c[fg]), rgb(c[surface])) < 4.5) failures.push(`${fg} on ${surface}`);
      for (const fg of NON_TEXT) if (contrast(rgb(c[fg]), rgb(c[surface])) < 3) failures.push(`${fg} on ${surface}`);
    }
    if (contrast(rgb(c["on-sun"]), rgb(c.sun)) < 4.5) failures.push("on-sun on sun");
    expect(failures).toEqual([]);
  });

  it("themes recolour the accent and ground tint without breaking contrast", () => {
    const { ground, lightInk } = PULSE_THEME_MIX;
    for (const mode of ["dark", "light"] as const) expect(css).toContain(`color-mix(in srgb, var(--color-sun) ${ground}%, ${PULSE_COLORS[mode].bg})`);
    expect(css).toContain(`color-mix(in srgb, var(--color-sun) ${lightInk}%, ${PULSE_COLORS.light.text})`);

    const failures: string[] = [];
    for (const theme of THEMES.filter((t) => t.id !== "solar")) {
      for (const mode of ["dark", "light"] as const) {
        const c = PULSE_COLORS[mode];
        const bg = mix(theme.accent, ground, c.bg);
        const ink = mode === "dark" ? rgb(theme.accent) : mix(theme.accent, lightInk, c.text);
        for (const [name, surface] of [["bg", bg], ["surface", rgb(c.surface)], ["raised", rgb(c.raised)]] as const) {
          for (const [fg, color] of [["text", rgb(c.text)], ["text-muted", rgb(c["text-muted"])], ["accent-ink", ink]] as const)
            if (contrast(color, surface) < 4.5) failures.push(`${theme.id} ${mode}: ${fg} on ${name}`);
        }
        if (contrast(rgb(c["on-sun"]), rgb(theme.accent)) < 4.5) failures.push(`${theme.id}: on-sun on accent`);
      }
    }
    expect(failures).toEqual([]);
  });
});
