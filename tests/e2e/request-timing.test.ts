import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

/**
 * BL-1069 instrumentation, from the outside.
 *
 * The per-request breakdown itself is a server log, so the only externally observable part is
 * `Server-Timing` - and the property worth pinning is that it is OFF unless the environment asked
 * for it. The header travels through CloudFront to every visitor and names upstream latency per leg,
 * so a default-on regression is an information leak, not a cosmetic one.
 *
 * `NUXT_TIMING_HEADER=true` flips it. When the target under test has that set, the assertion flips
 * with it: the header must then be well-formed rather than absent, so this spec is meaningful in the
 * environment where the instrument is actually being used.
 */
const timingHeaderExpected = process.env.NUXT_TIMING_HEADER === 'true'

test('Server-Timing is emitted only where the environment opted in', async ({ request }) => {
  const response = await request.get('/en')
  expect(response.ok()).toBe(true)

  const header = response.headers()['server-timing']

  if (!timingHeaderExpected) {
    expect(header).toBeUndefined()
    return
  }

  // `<name>;dur=<ms>` pairs, always closing with the request total.
  expect(header).toMatch(/^([\w-]+;dur=[\d.]+, )*total;dur=[\d.]+$/)
})

test('a static asset carries no timing header at all', async ({ request }) => {
  const response = await request.get('/favicon.ico')

  // Assets never touch Drupal, the DMSM config or the cache, so they are deliberately untimed -
  // otherwise one page view would emit hundreds of useless lines.
  expect(response.headers()['server-timing']).toBeUndefined()
})
