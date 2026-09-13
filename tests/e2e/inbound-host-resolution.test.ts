import { expect, test } from '@playwright/test'
import { getE2EBaseURL } from './e2e-targets'

test.use({ baseURL: getE2EBaseURL() })

test('unknown custom Host fails closed on a page path before query fallback', async ({ request }) => {
  const response = await request.get('/en?siteCode=e2e', {
    headers: { host: 'be.attacker.example', 'x-forwarded-host': 'be.attacker.example' },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(400)
})

test('the existing known-shape E2E target still serves its home page', async ({ request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
})
