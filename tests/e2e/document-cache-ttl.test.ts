import { expect, test } from '@nuxt/test-utils/playwright'

import { CACHE_TTL } from '../../shared/utils/constants'
import { DOCUMENT_MAX_TTL } from '../../shared/utils/document-cache-ttl'
import { getE2EBaseURL } from './e2e-targets'

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

/**
 * Every assertion here keys on `s-maxage`, which is the feature's fingerprint: the flat header from
 * `server/middleware/cache-control.js` has never emitted it. An earlier version of this spec asserted
 * things like "max-age is one of the allowed values" and "search returns the default" - every one of
 * which passed against a completely dead feature, which is worse than no test at all.
 *
 * Nothing asserts an exact tier, because a tier depends on the seeded content's `changed` date and
 * would drift. What is asserted is the shape: who gets an s-maxage, who must never get one, and that
 * the browser's own max-age never grows.
 */

type Res = { ok: () => boolean; status: () => number; headers: () => Record<string, string> }

const cacheControl = async (res: Res) => res.headers()['cache-control'] ?? ''

/** `max-age` for the browser, deliberately not matching the `s-maxage` substring. */
const browserMaxAge = (header: string): number | null => {
  const match = header.match(/(?:^|[^-])max-age=(\d+)/)

  return match ? Number(match[1]) : null
}

const sharedMaxAge = (header: string): number | null => {
  const match = header.match(/s-maxage=(\d+)/)

  return match ? Number(match[1]) : null
}

test('a content document is tiered for shared caches only', async ({ request }) => {
  const response = await request.get('/en')
  expect(response.ok()).toBe(true)

  const header = await cacheControl(response)

  // Fails if the feature is absent, dead, or never reached this route.
  expect(sharedMaxAge(header), `no s-maxage in: ${header}`).not.toBeNull()

  // The browser stays on the short default no matter how old the node is: a CDN entry can be
  // invalidated out of band, a copy in someone's browser cannot.
  expect(browserMaxAge(header)).toBe(CACHE_TTL.DEFAULT)
})

test('no document is ever cached beyond the ceiling', async ({ request }) => {
  const header = await cacheControl(await request.get('/en'))

  expect(sharedMaxAge(header)!).toBeLessThanOrEqual(DOCUMENT_MAX_TTL)
})

test('the home page is held to the youngest tier', async ({ request }) => {
  // Its node is typically years old, but it bakes live widget data into the SSR payload.
  const header = await cacheControl(await request.get('/en'))

  expect(sharedMaxAge(header)!).toBeLessThanOrEqual(CACHE_TTL.FIVE_MINUTES)
})

test('a request carrying a Drupal session is never tiered', async ({ request }) => {
  // The gate deliberately reads the cookie, not meStore.isAuthenticated: server/middleware/auth.js
  // computes that flag as `!isContentManager && isAuthenticated`, so it is false for content
  // managers, site managers and administrators - exactly the users whose HTML carries a CSRF token
  // and an email address in __NUXT_DATA__.
  const response = await request.get('/en', {
    headers: { Cookie: 'SSESS0123456789abcdef=e2e-not-a-real-session' },
  })

  const header = await cacheControl(response)

  expect(sharedMaxAge(header), `editor HTML was tiered: ${header}`).toBeNull()
})

test('the seachain-taisce cache bypass survives', async ({ request }) => {
  // cache-control.js answers this param with no-store, and the app reloads through it after login.
  // Tiering it would write a long-lived copy under the very key used to escape a stale one.
  const header = await cacheControl(await request.get('/en?seachain-taisce=e2e'))

  expect(header).toContain('no-store')
  expect(sharedMaxAge(header), `bypass was overwritten: ${header}`).toBeNull()
})

test('aggregate routes are excluded from tiering', async ({ request }) => {
  // A search node's `changed` describes the container, not the live result set rendered into it.
  const header = await cacheControl(await request.get('/en/search'))

  expect(sharedMaxAge(header), `search was tiered: ${header}`).toBeNull()
})

test('a tiered response tells shared caches what it varies on', async ({ request }) => {
  // The app picks its entire tenant from Host. At 15s a cache-key gap self-healed; at a day it
  // would serve one tenant's HTML under another's domain.
  const response = await request.get('/en')
  const vary = response.headers()['vary'] ?? ''

  expect(vary).toContain('Host')
  expect(vary).toContain('Accept-Encoding')
})

test('a missing page does not inherit a tier', async ({ request }) => {
  // The TTL is decided in route middleware but written at beforeResponse, precisely so a
  // render-time createError cannot ship an error page with a long shared TTL.
  const response = await request.get('/en/this-path-does-not-exist-bl1059')

  expect(response.status()).toBe(404)
  expect(sharedMaxAge(await cacheControl(response)), 'error page was tiered').toBeNull()
})
