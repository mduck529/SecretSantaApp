import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * End-to-end test (docs/TASKS.md, L5). Needs a running Supabase stack and Mailpit
 * (`supabase start`) and a built app: see e2e/README.md. Run with `pnpm --filter @santa/web e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "off", ...devices["Pixel 7"] },
  // Starts the built app unless one is already running (set E2E_BASE_URL to use your own).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: baseURL, reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
