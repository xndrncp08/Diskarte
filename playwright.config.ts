import { defineConfig, devices } from "@playwright/test";
import { EMAIL_OUTBOX, PORTAL_PORT, PORTAL_URL } from "./e2e/portal";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

/**
 * E2E suite.
 * - `e2e/smoke.spec.ts` needs only the app (runs anywhere).
 * - Journey specs need Supabase + LiveKit; they run when E2E_FULL=1 (CI starts both locally).
 * The web server is the production standalone build, mirroring the Docker image.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    permissions: ["microphone", "camera"],
    launchOptions: {
      // Fake mic/camera so the voice journey can publish tracks headlessly.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], permissions: ["microphone", "camera"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "npm run start:standalone",
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: { PORT: String(PORT) },
        },
        // The Early Access portal (separate app) joins full runs: its journey spans both apps.
        ...(process.env.E2E_FULL === "1"
          ? [
              {
                command: "npm --prefix early-access-portal run start:standalone",
                url: `${PORTAL_URL}/api/health`,
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
                env: {
                  PORT: String(PORTAL_PORT),
                  SITE_URL: PORTAL_URL,
                  APP_URL: baseURL,
                  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
                  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
                  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
                  PORTAL_SECRET: "e2e-portal-secret-0123456789abcdef0123456789",
                  EMAIL_TRANSPORT: "file",
                  EMAIL_OUTBOX_DIR: EMAIL_OUTBOX,
                  RATE_LIMIT_APPLY_PER_HOUR: "100",
                },
              },
            ]
          : []),
      ],
});
