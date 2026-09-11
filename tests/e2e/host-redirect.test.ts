import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

// Scope note, so this spec is not read as coverage it does not provide.
//
// The Playwright target is `e2e.localhost:3330` (tests/e2e/e2e-targets.ts), and
// `handleHostRedirect` in server/plugins/locale.js bails on any `.localhost` Host
// before it compares anything. This test therefore pins only that the 302 stays
// dormant on the local target - it would still pass if the canonical/generated
// comparison were broken. The comparison itself is covered by the unit spec at
// tests/unit/server/plugins/locale.test.ts.
//
// The positive case - a request on the generated Host actually 302ing to a
// different canonical Host - needs a non-loopback fixture Site with `redirect`
// set (a DMSM stub or a dedicated dev Site config, per index.md prerequisite 1).
// That fixture does not exist yet, so the positive case is exercised by p03-01
// and is deliberately absent here.

test.use({
  baseURL: getE2EBaseURL(),
})

test('a request on the canonical host is not redirected', async ({ request }) => {
  const response = await request.get('/en', { maxRedirects: 0 })

  expect(response.status()).toBe(200)
})
