import { test, expect, type BrowserContext, type Page } from '@playwright/test'

import { getE2EBaseURL } from '../e2e-targets'
import { seedConsentCookies } from '../helpers/seed-consent-cookies'

const E2E_BASE_URL = getE2EBaseURL()
const HOME_PATH = '/en'

// Obviously fake IDs only. Never a real measurement or container ID.
const GTAG_ID = 'G-TEST1234567'
const GTM_ID = 'GTM-TEST123'
const ADS_ID = 'AW-123456789'
const LEGACY_ID = 'UA-12345-6'
const CONFIGURED_TAG_IDS = `${GTAG_ID},${GTM_ID},${ADS_ID},${LEGACY_ID},bad-id`

const ELIGIBLE_BASE_HOST = 'chm-cbd.net'

// The site gate now requires the browser's own hostname to match the multisite template too, not
// just the dmsm-configured host, so a reverse proxy forwarding `Host: <site>.chm-cbd.net` cannot
// put a tenant's real tags on an attacker origin. That means these tests have to run on the real
// `<siteCode>.chm-cbd.net` name rather than on `<siteCode>.localhost`. `--host-resolver-rules`
// points that name at whatever the dev server is already bound to, so no /etc/hosts entry and no
// test-only bypass in product code is needed. Every case, negative ones included, runs there, so
// the only condition that varies is the one under test.
const DEV_URL = new URL(E2E_BASE_URL)
const SITE_LABEL = DEV_URL.hostname.split('.')[0]
const ELIGIBLE_HOST = `${SITE_LABEL}.${ELIGIBLE_BASE_HOST}`
const ELIGIBLE_BASE_URL = `${DEV_URL.protocol}//${ELIGIBLE_HOST}${DEV_URL.port ? `:${DEV_URL.port}` : ''}`

test.use({
  baseURL: ELIGIBLE_BASE_URL,
  launchOptions: { args: [`--host-resolver-rules=MAP ${ELIGIBLE_HOST} ${DEV_URL.hostname}`] },
})

interface ContextOverrides {
  env?: string
  multiSiteCode?: string
  baseHost?: string
  published?: boolean
}

type DataLayerEntry = unknown[] | Record<string, unknown>

/**
 * Mirror every `dataLayer` push into sessionStorage and count page loads.
 *
 * The revoke path reloads the page, which wipes `window.dataLayer`, so the consent update has to
 * be captured as it happens rather than read back afterwards. sessionStorage survives the reload.
 */
async function installPageRecorder (page: Page): Promise<void> {
  await page.addInitScript(() => {
    const loads = Number(sessionStorage.getItem('__e2eLoads') || '0') + 1
    sessionStorage.setItem('__e2eLoads', String(loads))

    const record = (entry: unknown) => {
      const isArrayLike = Boolean(entry)
        && typeof entry === 'object'
        && typeof (entry as { length?: unknown }).length === 'number'
      const value = isArrayLike ? Array.from(entry as ArrayLike<unknown>) : entry
      const seen = JSON.parse(sessionStorage.getItem('__e2eDataLayer') || '[]')

      seen.push(JSON.parse(JSON.stringify(value, (_key, raw) => (
        raw instanceof Date ? raw.toISOString() : raw
      ))))
      sessionStorage.setItem('__e2eDataLayer', JSON.stringify(seen))
    }

    let backing: unknown[] | undefined
    const PATCHED = '__e2ePushPatched'

    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      get: () => backing,
      set (next: unknown[]) {
        backing = next

        // One-shot per array. Both `@nuxt/scripts` registries run
        // `window[dataLayerName] = window[dataLayerName] || []`, which re-assigns the same array
        // through this setter; patching again each time would wrap the already-wrapped `push` and
        // record every later entry once per wrap.
        if ((next as unknown as Record<string, unknown>)[PATCHED]) return

        Object.defineProperty(next, PATCHED, { value: true, enumerable: false })

        const push = next.push.bind(next)

        next.push = (...entries: unknown[]) => {
          entries.forEach(record)

          return push(...entries)
        }
      },
    })
  })
}

/**
 * Intercept the client context re-fetch so the site eligibility inputs and the configured tag IDs
 * are under the test's control, and stub every Google endpoint so no real request is made.
 *
 * The gate no longer compares the dmsm-configured host (`context-unified.ts` always builds it as
 * `<siteCode>.bl2.chm-cbd.net`, never the public template) — it compares the browser's own
 * hostname against the template plus `config.published`, so eligibility here is steered through
 * `baseHost` (for the browser-visible host, via `ELIGIBLE_BASE_URL`) and `overrides.published`
 * (for the dmsm `published` flag), not through the payload's own `host` field.
 */
async function installRoutes (page: Page, overrides: ContextOverrides = {}): Promise<void> {
  await page.route('**/api/context/**', async (route) => {
    // `--host-resolver-rules` is a browser flag, and `route.fetch` runs in node, which would try to
    // resolve the real `<site>.chm-cbd.net` and hang the request the `site` plugin awaits. Fetch
    // the dev server by the name it is actually bound to; the site is resolved off the first host
    // label either way, so the payload is identical.
    const target = new URL(route.request().url())

    target.hostname = DEV_URL.hostname

    const response = await route.fetch({ url: target.toString() })
    const payload = await response.json()

    await route.fulfill({
      json: {
        ...payload,
        env: overrides.env ?? 'prod',
        multiSiteCode: overrides.multiSiteCode ?? 'bl2',
        baseHost: overrides.baseHost ?? ELIGIBLE_BASE_HOST,
        config: {
          ...(payload.config ?? {}),
          published: overrides.published ?? true,
        },
        biolandSettings: {
          ...(payload.biolandSettings ?? {}),
          googleAnalyticsIds: CONFIGURED_TAG_IDS,
        },
      },
    })
  })

  await page.route('**://*.googletagmanager.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.__gtagStub = 1;',
    })
  })
}

async function readDataLayer (page: Page): Promise<DataLayerEntry[]> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('__e2eDataLayer') || '[]'))
}

async function readLoadCount (page: Page): Promise<number> {
  try {
    return await page.evaluate(() => Number(sessionStorage.getItem('__e2eLoads') || '0'))
  } catch (error) {
    // `expect.poll` does not retry when its generator throws (only when the matcher fails), and
    // revoke's `window.location.reload()` can destroy the execution context mid-poll. Report a
    // value the matcher will reject so the poll keeps ticking instead of failing on that
    // transient navigation race; any other error still propagates.
    if (error instanceof Error && /Execution context was destroyed/.test(error.message)) {
      return -1
    }

    throw error
  }
}

function countConfigCalls (entries: DataLayerEntry[], id: string): number {
  return entries.filter((entry) => Array.isArray(entry) && entry[0] === 'config' && entry[1] === id).length
}

/** Index of the first dataLayer entry whose command is `command`, or -1. */
function indexOfCommand (entries: DataLayerEntry[], command: string): number {
  return entries.findIndex((entry) => Array.isArray(entry) && entry[0] === command)
}

/** The parameters passed alongside `config <id>`, or undefined when that config never happened. */
function configParams (entries: DataLayerEntry[], id: string): unknown {
  const entry = entries.find((candidate) => (
    Array.isArray(candidate) && candidate[0] === 'config' && candidate[1] === id
  )) as unknown[] | undefined

  return entry?.[2]
}

function googleScripts (page: Page) {
  return page.locator('script[src*="googletagmanager.com"]')
}

async function seedGoogleCookies (context: BrowserContext): Promise<void> {
  // Playwright rejects a cookie carrying both `url` and `path` ("Cookie should have either url or
  // path"). Use `domain` + `path` instead, scoped to match exactly what the product's own `load()`
  // tells gtag to write (`cookie_domain: window.location.hostname, cookie_path: '/'`). The revoke
  // path deletes this domain-qualified form explicitly (`path=/; domain=${window.location.hostname}`),
  // so seeding it here genuinely exercises that deletion rather than only the host-only fallback.
  const domain = new URL(ELIGIBLE_BASE_URL).hostname

  await context.addCookies([
    { name: '_ga', value: 'GA1.1.111.222', domain, path: '/' },
    { name: `_ga_${GTAG_ID.slice(2)}`, value: 'GS1.1.333', domain, path: '/' },
  ])
}

async function cookieNames (context: BrowserContext): Promise<string[]> {
  return (await context.cookies(ELIGIBLE_BASE_URL)).map((cookie) => cookie.name)
}

test.describe('BL-933: Google tags follow analytics consent', () => {
  test.describe.configure({ mode: 'serial' })

  test.setTimeout(60000)

  test('(a) consent granted on an eligible site loads each tag exactly once', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)

    await expect(page.locator(
      `script[src*="googletagmanager.com/gtag/js"][src*="id=${GTAG_ID}"]`,
    )).toBeAttached({ timeout: 20000 })

    await expect(page.locator(
      `script[src*="googletagmanager.com/gtm.js"][src*="id=${GTM_ID}"]`,
    )).toBeAttached()

    const entries = await readDataLayer(page)

    expect(countConfigCalls(entries, GTAG_ID)).toBe(1)
    expect(countConfigCalls(entries, ADS_ID)).toBe(1)
    expect(countConfigCalls(entries, LEGACY_ID)).toBe(1)

    // The rejected token never reaches the loader.
    expect(countConfigCalls(entries, 'BAD-ID')).toBe(0)

    const hostname = new URL(ELIGIBLE_BASE_URL).hostname
    const cookieParams = { cookie_domain: hostname, cookie_path: '/' }
    const setIndex = indexOfCommand(entries, 'set')
    const consentIndex = indexOfCommand(entries, 'consent')
    const firstConfigIndex = indexOfCommand(entries, 'config')

    // Order, not mere presence: a `set` emitted after the first `config` would leave that property
    // on `cookie_domain: auto`, i.e. the registrable domain every tenant on it can read.
    expect(setIndex).toBeGreaterThanOrEqual(0)
    expect(firstConfigIndex).toBeGreaterThanOrEqual(0)
    expect(setIndex).toBeLessThan(firstConfigIndex)
    expect((entries[setIndex] as unknown[])[1]).toEqual(cookieParams)

    // Consent Mode defaults deny every advertising purpose before any tag is configured, because
    // the banner text only ever promised analytics and the grammar admits `AW-` and `DC-`.
    expect(consentIndex).toBeGreaterThanOrEqual(0)
    expect(consentIndex).toBeLessThan(firstConfigIndex)
    expect(entries[consentIndex]).toMatchObject({
      0: 'consent',
      1: 'default',
      2: { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    })

    // Every config carries the cookie params explicitly, including the first measurement ID, since
    // gtag documents `set` as applying to subsequent events rather than to `config`.
    expect(configParams(entries, GTAG_ID)).toEqual(cookieParams)
    expect(configParams(entries, ADS_ID)).toEqual(cookieParams)
    expect(configParams(entries, LEGACY_ID)).toEqual(cookieParams)

    // GTM containers load with Google's no personalised advertising flag.
    await expect(page.locator(
      `script[src*="googletagmanager.com/gtm.js"][src*="gtm_npa=1"]`,
    )).toBeAttached()

    // In-app navigation must not re-run the loader.
    const internalLink = page.locator(`a[href^="${HOME_PATH}/"]`).first()

    await expect(internalLink).toBeAttached({ timeout: 20000 })
    await internalLink.click()
    await page.waitForLoadState('networkidle')

    const afterNav = await readDataLayer(page)

    expect(countConfigCalls(afterNav, GTAG_ID)).toBe(1)
    expect(countConfigCalls(afterNav, ADS_ID)).toBe(1)
    expect(countConfigCalls(afterNav, LEGACY_ID)).toBe(1)
    expect(await readLoadCount(page)).toBe(1)
  })

  test('(b) a visitor who has given no consent loads nothing and is not reloaded', async ({ page }) => {
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
    expect(await readLoadCount(page)).toBe(1)
  })

  test('(b2) consent for other categories only loads nothing', async ({ context, page }) => {
    const url = `${new URL(ELIGIBLE_BASE_URL).origin}/`

    await context.addCookies([
      { name: 'ncc_c', value: 'bl2ga', url, sameSite: 'Strict' },
      { name: 'ncc_e', value: 'bl2', url, sameSite: 'Strict' },
    ])

    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(c) revoking consent silences Google, purges its cookies, and reloads once', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await seedGoogleCookies(context)
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)

    await expect(googleScripts(page).first()).toBeAttached({ timeout: 20000 })

    await page.getByTestId('nuxt-cookie-control-control-button').click()
    await page.getByRole('button', { name: 'Reset Preferences' }).click()

    await expect.poll(() => readLoadCount(page), { timeout: 20000 }).toBe(2)
    await page.waitForLoadState('networkidle')

    const entries = await readDataLayer(page)
    const consentUpdate = entries.find((entry) => (
      Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update'
    )) as unknown[] | undefined

    expect(consentUpdate?.[2]).toMatchObject({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })

    const names = await cookieNames(context)

    expect(names).not.toContain('_ga')
    expect(names).not.toContain(`_ga_${GTAG_ID.slice(2)}`)

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readLoadCount(page)).toBe(2)
  })

  test('(d) a non-prod env loads nothing even with consent', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { env: 'stg' })

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(e) a multisite with no host template loads nothing even with consent', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { multiSiteCode: 'bsl' })

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(f) a host outside the multisite template loads nothing even with consent', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { baseHost: 'wrong-domain.com' })

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)

    // `baseHost: 'wrong-domain.com'` is unreachable, and the page-content pipeline's own alias/
    // JSON:API lookups for that host (unrelated to the google-tags plugin: `useGetPage` /
    // `mapAliasByLocale`, per the server logs) retry against it indefinitely, so `networkidle`
    // never settles for this scenario. `load` is enough here: the plugin's eligibility gate is
    // evaluated synchronously off the mocked `/api/context/**` response, not off that unrelated
    // background traffic, so nothing about this assertion needs network quiescence.
    await page.waitForLoadState('load')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(g0) an unpublished site loads nothing even with consent and a matching browser host', async ({ context, page }) => {
    await seedConsentCookies(context, ELIGIBLE_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { published: false })

    await page.goto(`${ELIGIBLE_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(g) a browser on a host outside the template loads nothing, even when the config says otherwise', async ({ context, page }) => {
    // The configured host is the eligible one and consent is granted: the only thing wrong is the
    // hostname the browser is on. This is the reverse-proxy case, where an attacker origin forwards
    // `Host: <site>.chm-cbd.net` to get a tenant's real tags running on a domain it controls.
    await seedConsentCookies(context, E2E_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })
})
