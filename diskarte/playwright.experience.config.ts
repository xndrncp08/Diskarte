import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  outputDir: "test-results/experience",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3130",
    channel: "chromium",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --config tests/browser/vite.config.mts",
    url: "http://127.0.0.1:3130",
    reuseExistingServer: !process.env.CI,
  },
});
