import { defineConfig, devices } from "@playwright/test";

// End-to-end checks run against the real local stack (nextstep-infrastructure
// scripts/local-stack.mjs). A few error states that the stack can't produce on demand
// are simulated per test by intercepting API responses; nothing ships a fake backend.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "en-US",
    timezoneId: "Europe/Berlin",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm start",
    url: "http://localhost:3000/signin",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
