import { expect, test } from '@nuxt/test-utils/playwright'
import type { NuxtApp } from 'nuxt/app'

import { getE2EBaseURL, getE2ETarget } from './e2e-targets'

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

test('hydration preserves the exact siteCode state from SSR context', async ({ page, goto }) => {
  const response = await goto('/en', { waitUntil: 'hydration' })
  expect(response?.ok()).toBe(true)

  // Nuxt prefixes useState('siteCode') with "$s" in its serialized payload.
  // Check the server's inline payload as well as the hydrated state; do not
  // accept siteCodeState, a Pinia fallback, or a cookie-derived substitute.
  const serializedPayload = await page.locator('#__NUXT_DATA__').textContent()
  expect(serializedPayload).toContain('"$ssiteCode"')

  const hydrated = await page.evaluate(() => {
    // Nuxt removes window.__NUXT__ after reviving the payload.
    const app = (window as Window & { useNuxtApp: () => NuxtApp }).useNuxtApp()
    return {
      isHydrating: app.isHydrating,
      serverRendered: app.payload.serverRendered,
      hasSiteCode: Object.hasOwn(app.payload.state, '$ssiteCode'),
      siteCode: app.payload.state.$ssiteCode,
      error: app.payload.error?.statusCode ?? null,
    }
  })

  expect(hydrated).toEqual({
    isHydrating: false,
    serverRendered: true,
    hasSiteCode: true,
    siteCode: getE2ETarget(),
    error: null,
  })
})
