import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

// The e2e target Site has no `redirect` configured, so its canonical Host equals
// its generated Host and the 301 in server/plugins/locale.js must stay dormant.
//
// The positive case - a request on the generated Host actually 301ing to a
// different canonical Host - needs a fixture Site with `redirect` set (a DMSM
// stub or a dedicated dev Site config, per index.md prerequisite 1). That
// fixture does not exist yet, so the positive case is exercised by p03-01 and
// is deliberately absent here.

test.use({
  baseURL: getE2EBaseURL(),
})

test('a request on the canonical host is not redirected', async ({ request }) => {
  const response = await request.get('/en', { maxRedirects: 0 })

  expect(response.status()).toBe(200)
})
