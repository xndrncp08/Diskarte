import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Pulse components style only through Pulse tokens (src/app/pulse.css): raw palette utilities, Classic tokens
// and hex colours would bypass the themes, light mode and the contrast checks in tests/ui/pulse-tokens.test.ts.
const CLASSIC_TOKEN = String.raw`(^|[\s:!])(bg|text|border(-[xytrbl])?|ring(-offset)?|outline|fill|stroke|from|via|to|shadow|decoration|divide|caret|placeholder)-(sun(-deep)?|midnight|abyss|onyx|panel|neon)(?![\w-])`;
const PULSE_RAW_COLOR = String.raw`/(^|[\s:!])[a-z]+(-[a-z]+)*-((slate|gray)-\d|(white|black)(?![\w-]))|-\[#[0-9a-fA-F]|${CLASSIC_TOKEN}/`;
const HEX = String.raw`/#[0-9a-fA-F]{3}/`;
const PULSE_MESSAGE =
  "Pulse components use Pulse tokens, not raw colours: bg-pulse-surface, text-pulse-muted, border-pulse-line, text-pulse-accent-ink… (docs/design-system.md#diskarte-pulse).";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/pulse/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${PULSE_RAW_COLOR}]`, message: PULSE_MESSAGE },
        { selector: `TemplateElement[value.raw=${PULSE_RAW_COLOR}]`, message: PULSE_MESSAGE },
        { selector: `JSXAttribute[name.name="style"] Literal[value=${HEX}]`, message: PULSE_MESSAGE },
        { selector: `JSXAttribute[name.name="style"] TemplateElement[value.raw=${HEX}]`, message: PULSE_MESSAGE },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project-specific ignores:
    ".claude/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
