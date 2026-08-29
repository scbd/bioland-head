import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './tests/e2e/e2e-targets'
import { assertE2EEnv } from './tests/e2e/assert-e2e-env'

// Fail fast on a missing or incomplete .env. Without it `nuxt dev` still binds its port,
// but every request throws and Playwright surfaces that only as a 120s webServer timeout.
assertE2EEnv()

export default defineConfig<ConfigOptions>({
  testDir: "./tests/e2e",
  outputDir: "./.test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "./.playwright-report", open: "never" }]],
  
  // Auto-start dev server before running tests
  webServer: {
    command: 'yarn nuxt dev --host e2e.localhost --port 3330',
    url: 'http://e2e.localhost:3330',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 minutes for server to start and warm up
    stdout: 'pipe',
    stderr: 'pipe',
  },
  
  use: {
    trace: "on-first-retry",
    baseURL: getE2EBaseURL(),
    nuxt: {
      // Still set rootDir so Nuxt test utils can apply its fixtures.
      // When `host` is provided, Nuxt test utils will not rebuild/restart Nuxt.
      rootDir: fileURLToPath(new URL(".", import.meta.url)),
      host: getE2EBaseURL(),
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
