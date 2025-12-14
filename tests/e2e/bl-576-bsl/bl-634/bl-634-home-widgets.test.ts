import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from "../../e2e-targets";
import { seedConsentCookies } from '../../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL();

test.use({
  baseURL: E2E_BASE_URL,
})

test('BL-634: biosafety home widgets have ids and correct order', async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000)

  // Pre-seed consent cookies so the cookie bar doesn't cover screenshots.
  await seedConsentCookies(page.context(), E2E_BASE_URL)

  await page.goto('/', { waitUntil: 'networkidle' })

  const nbf = page.locator('#home-bch-national-biosafety-framework')
  const news = page.locator('#home-bch-news')
  const resources = page.locator('#home-bch-resources')

  // These widgets are rendered within <ClientOnly>, so allow extra time for hydration.
  await expect(nbf).toHaveCount(1, { timeout: 30_000 })
  await expect(news).toHaveCount(1, { timeout: 30_000 })
  await expect(resources).toHaveCount(1, { timeout: 30_000 })

  await expect(nbf).toHaveAttribute('data-testid', 'home-bch-national-biosafety-framework')
  await expect(news).toHaveAttribute('data-testid', 'home-bch-news')
  await expect(resources).toHaveAttribute('data-testid', 'home-bch-resources')

  const nbfEl = await nbf.elementHandle()
  const newsEl = await news.elementHandle()
  const resourcesEl = await resources.elementHandle()

  if (!nbfEl || !newsEl || !resourcesEl) {
    throw new Error('Expected biosafety home widgets to render (missing element handles)')
  }

  // Jira summary: "reverse last 2 widgets" => news should appear before resources.
  const newsBeforeResources = await page.evaluate(([a, b]) => {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  }, [newsEl, resourcesEl])

  expect(newsBeforeResources).toBe(true)

  // Helpful context: ensure the first widget remains before news (guards against full reversal).
  const nbfBeforeNews = await page.evaluate(([a, b]) => {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
  }, [nbfEl, newsEl])

  expect(nbfBeforeNews).toBe(true)

  const screenshotPath = testInfo.outputPath("bl-634/bl-634-biosafety-home.png");
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach('BL-634 biosafety home order', {
    path: screenshotPath,
    contentType: 'image/png',
  })
})
