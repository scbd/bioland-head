import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from '../../e2e-targets'
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()

test.use({
  baseURL: E2E_BASE_URL,
})

test('BL-581: content-types-stats widget is NOT rendered on BCH home', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000)

  // Pre-seed consent cookies so the cookie bar doesn't cover the page.
  await seedConsentCookies(page.context(), E2E_BASE_URL)

  // Use '/' so this test remains compatible even if the configured baseURL
  // already includes a locale prefix (e.g. https://host/en).
  await page.goto('/', { waitUntil: 'networkidle' })

  // These sections are rendered within <ClientOnly>, so allow extra time for hydration.
  const nbf = page.locator('#home-bch-national-biosafety-framework')
  const news = page.locator('#home-bch-news')
  const resources = page.locator('#home-bch-resources')

  await expect(nbf).toHaveCount(1, { timeout: 30_000 })
  await expect(news).toHaveCount(1, { timeout: 30_000 })
  await expect(resources).toHaveCount(1, { timeout: 30_000 })

  // Extra guardrails: confirm we really are on the BCH home and ClientOnly widgets hydrated.
  await expect(nbf).toHaveAttribute('data-testid', 'home-bch-national-biosafety-framework')
  await expect(news).toHaveAttribute('data-testid', 'home-bch-news')
  await expect(resources).toHaveAttribute('data-testid', 'home-bch-resources')

  // Hydration: these sections render within <ClientOnly>, so their presence indicates client mount.
  // Wait for network to settle once more before checking for absence.
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('widget-content-types-stats')).toHaveCount(0)

  const screenshotPath = testInfo.outputPath('BL-581/bl-581-bch-home-no-stats.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach('BL-581 BCH home has no content-types-stats widget', {
    path: screenshotPath,
    contentType: 'image/png',
  })
})
