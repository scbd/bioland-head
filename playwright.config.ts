import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './tests/e2e/e2e-targets'

export default defineConfig<ConfigOptions>({
  testDir: "./tests/e2e",
  outputDir: "./.test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "./.playwright-report", open: "never" }]],
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
