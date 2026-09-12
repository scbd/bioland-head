import { writeFile } from 'node:fs/promises'
import { expect, test } from '@nuxt/test-utils/playwright'
import type { NuxtApp } from 'nuxt/app'
import type { Pinia } from 'pinia'
import fixture from './fixtures/dmsm-config.json' with { type: 'json' }

const siteCode = fixture.siteCode
const canonical = fixture.sites.seed.redirect
const canonicalOrigin = `https://${canonical}`
const browserOrigin = `http://${canonical}:3431`
const generated = `${siteCode}.${fixture.baseHost}`
const exactPath = '/en?probe=a%2Fb&repeat=one&repeat=two&space=a+b&empty='

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ context }) => {
  // Browser traffic can only reach this test's real Nuxt server. No fulfilled
  // routes: the application must fetch and render its own context/data/assets.
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.origin === browserOrigin ? route.continue() : route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => socket.close())
})

test('generated Host redirects once with exact path/query; canonical Host serves 200', async ({ request }) => {
  const redirect = await request.get(exactPath, { headers: { host: generated }, maxRedirects: 0 })
  expect(redirect.status()).toBe(302)
  expect(redirect.headers().location).toBe(`${canonicalOrigin}${exactPath}`)

  // Same original path/query, not a followed request to an external HTTPS origin.
  const target = await request.get(exactPath, { headers: { host: canonical }, maxRedirects: 0 })
  expect(target.status()).toBe(200)
  expect(target.headers().location).toBeUndefined()
  expect(await target.text()).toContain('Isolated redirect-host fixture content.')
})

test('reverse index resolves canonical Host into SSR state, canonical and hreflang', async ({ request }) => {
  const response = await request.get('/en', { headers: { host: canonical }, maxRedirects: 0 })
  expect(response.status()).toBe(200)
  const html = await response.text()
  const payloadText = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  expect(payloadText).toBeTruthy()
  const payload: unknown[] = JSON.parse(payloadText!)
  const states = payload.filter((value): value is Record<string, number> => !!value && typeof value === 'object' && Object.hasOwn(value, '$ssiteCode'))
  expect(states).toHaveLength(1)
  expect(payload[states[0].$ssiteCode]).toBe(siteCode)

  const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] || ''
  const links = [...head.matchAll(/<link\b[^>]*>/g)].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])))
  expect(links.filter(link => link.rel === 'canonical')).toEqual([{ rel: 'canonical', href: `${canonicalOrigin}/en` }])
  const alternates = links.filter(link => link.hreflang)
  expect(alternates).toContainEqual({ rel: 'alternate', hreflang: 'fr', href: `${canonicalOrigin}/fr` })
  for (const link of alternates) expect(new URL(link.href).hostname).toBe(canonical)

  const backend = await request.get('http://127.0.0.1:3432/requests')
  const records: Array<{ path: string; origin: string; status: number }> = await backend.json()
  expect(records).toContainEqual(expect.objectContaining({ path: `/config/prod/${fixture.multiSiteCode}`, status: 200 }))
  expect(records).toContainEqual(expect.objectContaining({ path: `/config/prod/${fixture.multiSiteCode}/${siteCode}`, status: 200 }))
  expect(records).toContainEqual(expect.objectContaining({ path: '/en/router/translate-path', origin: canonicalOrigin, status: 200 }))
  expect(records.filter(record => record.status !== 200)).toEqual([])
})

test('unknown Host fails closed despite a valid siteCode query and context cookie', async ({ request }) => {
  const cookie = encodeURIComponent(JSON.stringify({ siteCode, locale: 'en', defaultLocale: 'en', locales: ['en', 'fr'] }))
  const response = await request.get(`/en?siteCode=${siteCode}`, {
    headers: { host: 'unmapped.example.test', cookie: `context=${cookie}` }, maxRedirects: 0,
  })
  expect(response.status()).toBe(400)
  expect(response.headers().location).toBeUndefined()
})

test('mapped .test Host hydrates the SSR siteCode and prod redirect without a client 404', async ({ page, goto, request }, testInfo) => {
  const pageErrors: string[] = []
  const badResponses: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    if (new URL(response.url()).origin === browserOrigin && response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`)
  })
  const response = await goto(`${browserOrigin}/en`, { waitUntil: 'hydration' })
  expect(response?.status()).toBe(200)
  await expect(page.getByText('Isolated redirect-host fixture content.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => {
    const app = (window as Window & { useNuxtApp: () => NuxtApp }).useNuxtApp()
    const site = (app.$pinia as Pinia).state.value.site
    return { isHydrating: app.isHydrating, serverRendered: app.payload.serverRendered,
      siteCode: app.payload.state.$ssiteCode, storeSiteCode: site.siteCode,
      redirect: site.redirect, error: app.payload.error?.statusCode ?? null }
  })).toEqual({ isHydrating: false, serverRendered: true, siteCode, storeSiteCode: siteCode, redirect: canonical, error: null })
  await expect(page).toHaveURL(`${browserOrigin}/en`)
  expect(pageErrors).toEqual([])
  expect(badResponses).toEqual([])
  const backend = await request.get('http://127.0.0.1:3432/requests')
  const records: Array<{ path: string; origin: string; status: number }> = await backend.json()
  expect(records.filter(record => record.status !== 200)).toEqual([])
  expect(records).toContainEqual(expect.objectContaining({ path: '/user/login', origin: canonicalOrigin, status: 200 }))
  const evidencePath = testInfo.outputPath('backend-requests.json')
  await writeFile(evidencePath, JSON.stringify(records, null, 2))
  await testInfo.attach('backend-requests', { path: evidencePath, contentType: 'application/json' })
})
