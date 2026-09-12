import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './tests/e2e/e2e-targets'

// Opt-in only: never start the live-backed default server for composed BL-942 tests.
const isolatedRedirectHost = process.env.BL942_ISOLATED_E2E === '1'
const fixtureOrigin = 'http://127.0.0.1:3431'

export default defineConfig<ConfigOptions>(isolatedRedirectHost ? {
  testDir: './tests/e2e/site-redirect-host',
  outputDir: './.test-results/bl942',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  webServer: [
    {
      command: 'node tests/e2e/site-redirect-host/fixtures/dmsm-stub-server.mjs',
      url: 'http://127.0.0.1:3432/health',
      reuseExistingServer: false,
      timeout: 15_000,
      stdout: 'pipe', stderr: 'pipe',
    },
    {
      // Run `yarn build --dotenv /dev/null` with fixture public env first.
      command: 'node tests/e2e/site-redirect-host/fixtures/serve-nuxt.mjs',
      url: `${fixtureOrigin}/favicon.ico`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe', stderr: 'pipe',
    },
  ],
  use: {
    baseURL: fixtureOrigin,
    nuxt: { rootDir: fileURLToPath(new URL('.', import.meta.url)), host: fixtureOrigin },
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    launchOptions: { args: ['--host-resolver-rules=MAP chm.example.test 127.0.0.1', '--no-proxy-server'] },
  },
  projects: [{ name: 'bl942-isolated-chromium', use: { ...devices['Desktop Chrome'] } }],
} : {
  testDir: "./tests/e2e",
  testIgnore: ['**/site-redirect-host/**'],
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
