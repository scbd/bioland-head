import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

test.use({
  baseURL: getE2EBaseURL(),
})

test('home page has correct title', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveTitle(/Biosafety Seed \(GT\)/)
})
