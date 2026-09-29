import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

// BL-1261: a path with no page data is a real 404 with a readable message, not a blank 200.
// A path that resolves keeps answering 200.
const html = { accept: 'text/html' }

test.use({
  baseURL: getE2EBaseURL(),
  storageState: { cookies: [], origins: [] },
})

test('an unknown path is a 404 that shows the not-found message', async ({ request }) => {
  const response = await request.get(`/en/bl-1261-zzz-not-real-${Date.now()}`, { headers: html, maxRedirects: 0 })

  expect(response.status()).toBe(404)
  expect(await response.text()).toContain('Page not found')
})

test('an unknown nested path is a 404 too', async ({ request }) => {
  const response = await request.get(`/en/other-resources/PASTE-FLOWCHART-URL-HERE-${Date.now()}`, { headers: html, maxRedirects: 0 })

  expect(response.status()).toBe(404)
})

test('a real path still answers 200', async ({ request }) => {
  const response = await request.get('/en', { headers: html })

  expect(response.status()).toBe(200)
})
