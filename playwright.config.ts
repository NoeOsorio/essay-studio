import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the keyboard / interaction E2E suite.
 *
 * Tests run against `next dev` (no Tauri). Each test stubs out
 * `window.__TAURI_INTERNALS__` via `page.addInitScript` so the
 * frontend boots without invoking real Tauri commands. Storage stays
 * in-memory inside the stub.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,
  // Single worker so the dev server's hot-state isn't churned by
  // parallel tests, and so the Tauri stub doesn't get clobbered.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // Use a different port from `npm run dev` so a manual dev session
    // doesn't collide with the test runner.
    command: "PORT=3100 npm run dev",
    url: "http://localhost:3100",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
