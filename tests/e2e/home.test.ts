import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'
import { getTargetExpectations } from './expectations'

const expectations = getTargetExpectations()

test.use({
  baseURL: getE2EBaseURL(),
})

test('home page has correct title', async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" })
  await expect(page).toHaveTitle(expectations.homeTitle)
})
