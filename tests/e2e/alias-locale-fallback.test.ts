import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL, getE2ETarget } from './e2e-targets'

// BL-1111: an alias that only exists in one locale is found by the cross-locale fallback
// and 301s there; an alias that exists nowhere stays a clean 404.
//
// Runs against the live Drupal behind the target (e2e.<NUXT_PUBLIC_BASE_HOST>). The
// fixture alias is real content on that backend: `/contacts/contacter` is the French
// alias of the contact page, whose English alias is `/contacts/contact`, so
// router/translate-path resolves it in `fr` only.
const FIXTURES: Partial<Record<ReturnType<typeof getE2ETarget>, { alias: string, locale: string }>> = {
  e2e: { alias: '/contacts/contacter', locale: 'fr' },
}

const fixture = FIXTURES[getE2ETarget()]

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

test('an alias owned by another locale 301s to that locale, and the target renders', async ({ request }) => {
  test.skip(!fixture, 'no single-locale alias fixture for this target')

  const { alias, locale } = fixture!
  const response = await request.get(`/en${alias}`, { maxRedirects: 0 })

  expect(response.status()).toBe(301)
  expect(new URL(response.headers().location, getE2EBaseURL()).pathname).toBe(`/${locale}${alias}`)

  const target = await request.get(`/${locale}${alias}`, { maxRedirects: 0 })

  expect(target.status()).toBe(200)
})

test('a repeat request for the same alias gets the same redirect', async ({ request }) => {
  test.skip(!fixture, 'no single-locale alias fixture for this target')

  const { alias, locale } = fixture!

  for (let i = 0; i < 5; i++) {
    const response = await request.get(`/en${alias}`, { maxRedirects: 0 })

    expect(response.status()).toBe(301)
    expect(new URL(response.headers().location, getE2EBaseURL()).pathname).toBe(`/${locale}${alias}`)
  }
})

test('an alias that exists in no locale is a clean 404, every time', async ({ request }) => {
  const missing = `/en/bl-1111-no-such-alias-${Date.now()}`

  for (let i = 0; i < 5; i++) {
    const response = await request.get(missing, { maxRedirects: 0 })

    expect(response.status()).toBe(404)
  }
})
