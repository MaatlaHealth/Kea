import { defineConfig, devices } from "@playwright/test";

/**
 * End to end configuration.
 *
 * These tests drive the real application against a real database. They expect
 * the demonstration data to have been seeded first:
 *
 *   KEA_DEMO_PASSWORD=... npm run db:migrate && npm run seed:demo
 *   KEA_DEMO_PASSWORD=... npm run test:e2e
 *
 * There is no password in this file. The suite is skipped when
 * KEA_DEMO_PASSWORD is not set, so a developer without a database still gets a
 * clean run rather than a wall of failures.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
