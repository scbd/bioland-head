import { expect, test } from '@nuxt/test-utils/playwright'

import { CACHE_TTL } from '../../shared/utils/constants'
import { DOCUMENT_CACHE_TIERS } from '../../shared/utils/document-cache-ttl'
import { getE2EBaseURL } from './e2e-targets'

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

/**
 * Every max-age a document response is allowed to carry: the middleware default, plus one per tier.
 * Asserting membership rather than an exact number keeps these specs independent of the seeded
 * content's `changed` dates, which drift as fixtures are re-seeded.
 */
const ALLOWED_MAX_AGE = new Set<number>([
  CACHE_TTL.DEFAULT,
  ...DOCUMENT_CACHE_TIERS.map(({ ttl }) => ttl),
])

const maxAgeOf = (header: string | null): number => {
  const match = header?.match(/max-age=(\d+)/)

  expect(match, `expected a max-age in Cache-Control: ${header}`).not.toBeNull()

  return Number(match![1])
}

const cacheControlFor = async (request: { get: (url: string) => Promise<{ ok: () => boolean; headers: () => Record<string, string> }> }, path: string) => {
  const response = await request.get(path)

  expect(response.ok()).toBe(true)

  return response.headers()['cache-control'] ?? null
}

test('a document response carries a recognised tier, never an arbitrary max-age', async ({ request }) => {
  const header = await cacheControlFor(request, '/en')

  expect(ALLOWED_MAX_AGE.has(maxAgeOf(header))).toBe(true)
})

test('the home page is never cached beyond the youngest tier', async ({ request }) => {
  // Its own node is typically years old, but it renders live widgets whose data is baked into the
  // SSR payload. Tiering it by node age would serve week-old news from the CDN.
  const header = await cacheControlFor(request, '/en')

  expect(maxAgeOf(header)).toBeLessThanOrEqual(CACHE_TTL.FIVE_MINUTES)
})

test('search is excluded from tiering entirely', async ({ request }) => {
  // The search node's `changed` describes the container, not the result set rendered into it.
  const header = await cacheControlFor(request, '/en/search')

  expect(maxAgeOf(header)).toBe(CACHE_TTL.DEFAULT)
})

test('the stale windows survive tiering, so no viewer waits on a revalidation', async ({ request }) => {
  const header = await cacheControlFor(request, '/en')

  expect(header).toContain(`stale-if-error=${CACHE_TTL.ONE_WEEK}`)
  expect(header).toContain(`stale-while-revalidate=${CACHE_TTL.ONE_DAY}`)
})

test('API routes keep the middleware default, proving the catch-all was not widened', async ({ request }) => {
  const response = await request.get('/api/menus/languages')

  // The route's own status is irrelevant here; only that it was never given a document tier.
  expect(maxAgeOf(response.headers()['cache-control'] ?? null)).not.toBeGreaterThan(CACHE_TTL.FIVE_MINUTES)
})
