import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser end-to-end tests, distinct from Vitest's jsdom-based
 * component/unit tests: these render actual pages in Chromium and drive
 * them through Playwright's DOM APIs. Network is mocked (see
 * e2e/fixtures.ts) rather than hitting a real backend/Supabase project, so
 * these run with zero secrets/credentials -- same "no environment
 * variables needed" property the rest of CI already has.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run serve -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
