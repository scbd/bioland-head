import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

const baseURL = getE2EBaseURL()

test.use({ baseURL })

// The sitemap routes build their absolute URLs from the request's canonical Host, so the body must
// echo the host the suite is pointed at and never the domain the routes used to hardcode.
test('xml sitemap uses the request host, never the hardcoded bl2 domain', async ({ request }) => {
  const expectedHost = new URL(baseURL).host

  const response = await request.get('/en/sitemap.xml')

  expect(response.status()).toBe(200)

  const body = await response.text()

  expect(body).toContain(expectedHost)
  expect(body).not.toContain('bl2.chm-cbd.net')
})

test('html sitemap uses the request host, never the hardcoded bl2 domain', async ({ request }) => {
  const expectedHost = new URL(baseURL).host

  const response = await request.get('/en/sitemap.html')

  expect(response.status()).toBe(200)

  const body = await response.text()

  expect(body).toContain(expectedHost)
  expect(body).not.toContain('bl2.chm-cbd.net')
})
