import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL, getE2ETarget } from './e2e-targets'

const baseURL = getE2EBaseURL()

test.use({ baseURL })

// The sitemap routes build their absolute URLs from `ctx.host`, the DMSM-derived canonical Host
// (see `server/utils/context-unified.ts` -> `buildSiteContext` -> `getCanonicalHost`) -- never
// from the request's Host header. With the redirect gate still dark (env !== "production"), that
// is the generated Host `https://<siteCode>.<NUXT_PUBLIC_BASE_HOST>`, which is not necessarily the
// Playwright baseURL, so the assertion is built from those same two inputs rather than from
// `baseURL` itself.
test('xml sitemap uses the canonical DMSM host, never the hardcoded bl2 domain', async ({ request }) => {
  const expectedHost = `${getE2ETarget()}.${process.env.NUXT_PUBLIC_BASE_HOST}`

  const response = await request.get('/en/sitemap.xml')

  expect(response.status()).toBe(200)

  const body = await response.text()

  expect(body).toContain(expectedHost)
  expect(body).not.toContain('bl2.chm-cbd.net')
})

test('html sitemap uses the canonical DMSM host, never the hardcoded bl2 domain', async ({ request }) => {
  const expectedHost = `${getE2ETarget()}.${process.env.NUXT_PUBLIC_BASE_HOST}`

  const response = await request.get('/en/sitemap.html')

  expect(response.status()).toBe(200)

  const body = await response.text()

  expect(body).toContain(expectedHost)
  expect(body).not.toContain('bl2.chm-cbd.net')
})
