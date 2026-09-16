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

// BL-1030 restored the browser-host half of the gate, so a tag only loads on a hostname this
// tenant actually serves: `<siteCode>.<baseHost>` or its dmsm redirect alias. That means these
// tests have to run on the real tenant name rather than on `<siteCode>.localhost`.
// `--host-resolver-rules` points that name, the alias, and a foreign origin at whatever the dev
// server is already bound to, so no /etc/hosts entry and no test-only bypass in product code is
// needed. Every case, negative ones included, runs on the tenant host unless the host is the
// condition under test, so only one thing varies at a time.
const DEV_URL = new URL(E2E_BASE_URL)
const SITE_LABEL = DEV_URL.hostname.split('.')[0]
const TENANT_BASE_HOST = 'chm-cbd.net'
const TENANT_HOST = `${SITE_LABEL}.${TENANT_BASE_HOST}`
const ALIAS_HOST = 'alias.example.test'
const FOREIGN_HOST = 'proxy.evil.test'
// Consent cookies are Secure in production. Unlike localhost, an HTTP tenant hostname cannot
// update them, so the browser must use HTTPS even when the rewritten backend transport is HTTP.
const urlFor = (host: string) => `https://${host}${DEV_URL.port ? `:${DEV_URL.port}` : ''}`
const TENANT_BASE_URL = urlFor(TENANT_HOST)
const ALIAS_BASE_URL = urlFor(ALIAS_HOST)
const FOREIGN_BASE_URL = urlFor(FOREIGN_HOST)

test.use({
  baseURL: TENANT_BASE_URL,
  launchOptions: {
    args: [`--host-resolver-rules=MAP ${TENANT_HOST} ${DEV_URL.hostname}, MAP ${ALIAS_HOST} ${DEV_URL.hostname}, MAP ${FOREIGN_HOST} ${DEV_URL.hostname}`],
  },
})

interface ContextOverrides {
  /** `bioland.settings.google_analytics_enabled`. Deliberately accepts malformed API values. */
  enabled?: unknown
  /** dmsm `config.redirect`, the tenant's alias. Absent means the tenant has none. */
  redirect?: string
}

type NuxtRoot = HTMLElement & {
  __vue_app__?: { $nuxt?: {
    isHydrating: boolean
    callHook: (name: string, args: Record<string, string>) => Promise<void>
  } }
}

async function waitForSiteInitialization (page: Page, interceptions: { contextFetches: number }): Promise<void> {
  // The async site plugin must finish before a zero-script assertion can prove anything.
  await page.waitForFunction(() => (
    (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt?.isHydrating === false
  ))
  expect(interceptions.contextFetches, 'the context route was never intercepted, so the configured switch and IDs are not under test').toBeGreaterThan(0)
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

/** Every hostname `--host-resolver-rules` points at the dev server. */
const MAPPED_HOSTS = new Set([TENANT_HOST, ALIAS_HOST, FOREIGN_HOST])

/**
 * Serve the mapped hostnames from the dev server without letting it see them.
 *
 * `--host-resolver-rules` only moves the TCP connection; the browser still sends
 * `Host: alias.example.test:3330`, and `server/utils/context-unified.ts` fails that closed with a
 * 400 - it is neither an internal host nor a suffix of the dev `baseHost`, and the dmsm reverse
 * index has never heard of it. Without this the SSR document is an error page, which would make
 * the positive cases fail and, worse, make the foreign-origin case pass for the wrong reason: an
 * error page trivially carries no Google script, so it proves nothing about the gate.
 *
 * So every request to a mapped hostname is refetched from node against the name the dev server is
 * actually bound to, exactly as the `/api/context` handler below already does, and fulfilled at
 * the original URL. The server therefore renders the real tenant page - which is precisely what a
 * reverse proxy forwarding a valid tenant `Host` achieves - while the browser's own
 * `location.hostname` stays the alias or the attacker origin. That is the one value the proxy
 * cannot forge and the only thing `isGoogleTagsBrowserHost` reads.
 *
 * Redirects are followed inside node, where `playwright-core` rewrites the `Host` header per hop,
 * and only the final response is fulfilled - at the original URL. The browser never sees a
 * `location`, so it never navigates and `location.hostname` stays the host under test. Handing it
 * the redirect instead would not work: Playwright does not re-intercept a browser-followed
 * redirect, so the follow-up request would reach the server with the unrewritten foreign `Host`
 * and fail closed at 400.
 */
async function installHostRewrite (page: Page): Promise<void> {
  await page.route('**/*', async (route) => {
    const target = new URL(route.request().url())
    const browserHost = target.hostname

    if (!MAPPED_HOSTS.has(browserHost)) return route.continue()

    target.hostname = DEV_URL.hostname
    target.protocol = DEV_URL.protocol

    try {
      await route.fulfill({ response: await route.fetch({ url: target.toString() }) })
    } catch {
      // A page closing at test end aborts whatever the app still had in flight, and Playwright
      // reports a throw from a route callback as a test failure. The request is already moot at
      // that point, so drop it rather than fail a test that has finished asserting.
      await route.abort().catch(() => {})
    }
  })
}

/**
 * Intercept the client context re-fetch so the administrator's switch and the configured tag IDs
 * are under the test's control, and stub every Google endpoint so no real request is made.
 *
 * `enabled` defaults to `true` because most cases here are about consent, not the switch. The
 * switch cases pass it explicitly. `baseHost` is forced to the public one so the tenant's
 * generated host is `<siteCode>.chm-cbd.net`, the name the browser is actually on; `redirect` is
 * always written, so a real dmsm alias on the dev site can never leak into a case that did not
 * ask for one. The navigation URL, not the payload, decides the browser host.
 */
async function installRoutes (page: Page, overrides: ContextOverrides = {}): Promise<{ contextFetches: number }> {
  // Registered first so it runs last: Playwright dispatches matching handlers in reverse
  // registration order, and the two specific handlers below must win over this catch-all.
  await installHostRewrite(page)

  // Every case must prove its configured payload was served, including zero-script assertions.
  const served = { contextFetches: 0 }

  await page.route('**/api/context/**', async (route) => {
    served.contextFetches += 1

    // `--host-resolver-rules` is a browser flag, and `route.fetch` runs in node, which would try
    // to resolve the real tenant name and hang the request the `site` plugin awaits. Fetch the
    // dev server by the name it is actually bound to; the site is resolved off the first host
    // label either way, so the payload is identical.
    const target = new URL(route.request().url())

    target.hostname = DEV_URL.hostname
    target.protocol = DEV_URL.protocol

    const response = await route.fetch({ url: target.toString() })
    const payload = await response.json()

    await route.fulfill({
      json: {
        ...payload,
        baseHost: TENANT_BASE_HOST,
        config: { ...(payload.config ?? {}), redirect: overrides.redirect },
        biolandSettings: {
          ...(payload.biolandSettings ?? {}),
          googleAnalyticsEnabled: Object.hasOwn(overrides, 'enabled') ? overrides.enabled : true,
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

  return served
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
  const domain = new URL(TENANT_BASE_URL).hostname

  await context.addCookies([
    { name: '_ga', value: 'GA1.1.111.222', domain, path: '/' },
    { name: `_ga_${GTAG_ID.slice(2)}`, value: 'GS1.1.333', domain, path: '/' },
  ])
}

async function cookieNames (context: BrowserContext): Promise<string[]> {
  return (await context.cookies(TENANT_BASE_URL)).map((cookie) => cookie.name)
}

test.describe('BL-933: Google tags follow analytics consent', () => {
  test.describe.configure({ mode: 'serial' })

  test.setTimeout(60000)

  test('(a) consent granted with the switch on loads each tag exactly once', async ({ context, page }) => {
    await seedConsentCookies(context, TENANT_BASE_URL)
    await installPageRecorder(page)
    const interceptions = await installRoutes(page)

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)

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

    const hostname = new URL(TENANT_BASE_URL).hostname
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
    const interceptions = await installRoutes(page)

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
    expect(await readLoadCount(page)).toBe(1)
  })

  test('(b2) consent for other categories only loads nothing', async ({ context, page }) => {
    const url = `${new URL(TENANT_BASE_URL).origin}/`

    await context.addCookies([
      { name: 'ncc_c', value: 'bl2ga', url, sameSite: 'Strict' },
      { name: 'ncc_e', value: 'bl2', url, sameSite: 'Strict' },
    ])

    await installPageRecorder(page)
    const interceptions = await installRoutes(page)

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(c) revoking consent silences Google, purges its cookies, and reloads once', async ({ context, page }) => {
    await seedConsentCookies(context, TENANT_BASE_URL)
    await seedGoogleCookies(context)
    await installPageRecorder(page)
    const interceptions = await installRoutes(page)

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)

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

  test('(d) the switch off loads nothing even with consent and configured IDs', async ({ context, page }) => {
    await seedConsentCookies(context, TENANT_BASE_URL)
    await installPageRecorder(page)
    const interceptions = await installRoutes(page, { enabled: false })

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })
})

test.describe('BL-1015: the Drupal switch is the only control', () => {
  test.setTimeout(60000)

  for (const [label, enabled] of [
    ['missing', undefined], ['null', null], ['string', 'true'], ['number', 1],
  ] as const) {
    test(`a ${label} switch value loads nothing`, async ({ context, page }) => {
      await seedConsentCookies(context, TENANT_BASE_URL)
      await installPageRecorder(page)
      const interceptions = await installRoutes(page, { enabled })

      await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page, interceptions)
      await page.waitForLoadState('networkidle')

      await expect(googleScripts(page)).toHaveCount(0)
      expect(await readDataLayer(page)).toEqual([])
    })
  }

  test('the switch on is sufficient on the tenant host, with no deployment condition', async ({ context, page }) => {
    await seedConsentCookies(context, TENANT_BASE_URL)
    await installPageRecorder(page)
    const interceptions = await installRoutes(page, { enabled: true })

    await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page, interceptions)

    await expect(googleScripts(page)).toHaveCount(2)
    expect(countConfigCalls(await readDataLayer(page), GTAG_ID)).toBe(1)
  })

  for (const enabled of [false, undefined]) {
    test(`a refetch restoring the switch after ${enabled} resumes tags without duplication or reload`, async ({ context, page }) => {
      const overrides: ContextOverrides = { enabled: true }
      await seedConsentCookies(context, TENANT_BASE_URL)
      await installPageRecorder(page)
      const interceptions = await installRoutes(page, overrides)

      await page.goto(`${TENANT_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page, interceptions)
      await expect(googleScripts(page)).toHaveCount(2)
      const scriptsBefore = await googleScripts(page).elementHandles()

      const beforeSwitchOff = interceptions.contextFetches
      overrides.enabled = enabled
      // Use the real site plugin's locale-refetch path, retaining the same hydrated store.
      await page.evaluate(async () => {
        const nuxt = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt
        if (!nuxt) throw new Error('Nuxt is not initialized')
        await nuxt.callHook('i18n:beforeLocaleSwitch', { oldLocale: 'en', newLocale: 'fr' })
      })
      expect(interceptions.contextFetches).toBeGreaterThan(beforeSwitchOff)

      await expect.poll(() => page.evaluate(id => (
        (window as unknown as Record<string, unknown>)[`ga-disable-${id}`]
      ), GTAG_ID)).toBe(true)
      expect(await readDataLayer(page)).toContainEqual(['consent', 'update', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      }])

      const beforeSwitchOn = interceptions.contextFetches
      overrides.enabled = true
      await page.evaluate(async () => {
        const nuxt = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt
        if (!nuxt) throw new Error('Nuxt is not initialized')
        await nuxt.callHook('i18n:beforeLocaleSwitch', { oldLocale: 'fr', newLocale: 'en' })
      })
      expect(interceptions.contextFetches).toBeGreaterThan(beforeSwitchOn)

      for (const id of [GTAG_ID, LEGACY_ID]) {
        await expect.poll(() => page.evaluate(tagId => (
          (window as unknown as Record<string, unknown>)[`ga-disable-${tagId}`]
        ), id)).toBe(false)
      }
      const entries = await readDataLayer(page)
      expect(entries.filter(entry => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update').at(-1)).toEqual([
        'consent', 'update', {
          analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
        },
      ])
      for (const id of [GTAG_ID, LEGACY_ID, ADS_ID]) expect(countConfigCalls(entries, id)).toBe(1)
      await expect(googleScripts(page)).toHaveCount(2)
      for (const script of scriptsBefore) expect(await script.evaluate(element => element.isConnected)).toBe(true)
      expect(await readLoadCount(page)).toBe(1)
    })
  }
})

test.describe('BL-1030: only a hostname this tenant serves may measure', () => {
  test.setTimeout(60000)

  test('a foreign origin forwarding a real tenant Host loads nothing', async ({ context, page }) => {
    // The proxy's `Host` resolves the tenant server-side, so the payload, the switch, the IDs and
    // the visitor's consent all look legitimate. Only the browser's own hostname gives it away.
    await seedConsentCookies(context, FOREIGN_BASE_URL)
    await installPageRecorder(page)
    const interceptions = await installRoutes(page, { enabled: true })

    const response = await page.goto(`${FOREIGN_BASE_URL}${HOME_PATH}`)

    await waitForSiteInitialization(page, interceptions)
    await page.waitForLoadState('networkidle')

    // The gate, not a failure, has to be what loaded nothing. An error page carries no Google
    // script either, so this case is only evidence once the visitor is provably on a rendered
    // tenant page: a 200 rather than the fail-closed 400, the tenant's own chrome in the DOM, and
    // a client context re-fetch served with the switch on and the IDs configured.
    expect(response?.status()).toBe(200)
    await expect(page.locator('#__nuxt header').first()).toBeVisible()
    expect(interceptions.contextFetches).toBeGreaterThan(0)
    expect(new URL(page.url()).hostname).toBe(FOREIGN_HOST)

    // A `seedConsentCookies` that silently seeded nothing on this origin would also produce zero
    // scripts, so the visitor's analytics consent has to be provably granted here first.
    const enabledConsent = await page.evaluate(() => decodeURIComponent(
      document.cookie.split('; ').find(pair => pair.startsWith('ncc_e='))?.slice('ncc_e='.length) ?? '',
    ))

    expect(enabledConsent.split('~')).toContain('ga')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  for (const redirect of [ALIAS_HOST, 'Alias.Example.TEST', 'Alias.Example.TEST.']) {
    test(`the tenant alias configured as ${redirect} loads tags on that alias`, async ({ context, page }) => {
      await seedConsentCookies(context, ALIAS_BASE_URL)
      await installPageRecorder(page)
      const interceptions = await installRoutes(page, { enabled: true, redirect })

      await page.goto(`${ALIAS_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page, interceptions)

      // Tags loading proves the alias branch only while the browser is still on the alias; had
      // anything moved it to the tenant host, the generated-host branch would have admitted it.
      expect(new URL(page.url()).hostname).toBe(ALIAS_HOST)

      await expect(googleScripts(page)).toHaveCount(2)
      expect(countConfigCalls(await readDataLayer(page), GTAG_ID)).toBe(1)
    })
  }

  for (const [label, redirect] of [
    ['no alias at all', undefined],
    ['some other tenant alias', 'other.example.test'],
    ['a non-canonical HTTPS alias', `https://${ALIAS_HOST}/`],
  ] as const) {
    test(`an alias host loads nothing with ${label}`, async ({ context, page }) => {
      await seedConsentCookies(context, ALIAS_BASE_URL)
      await installPageRecorder(page)
      const interceptions = await installRoutes(page, { enabled: true, redirect })

      await page.goto(`${ALIAS_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page, interceptions)
      await page.waitForLoadState('networkidle')

      await expect(googleScripts(page)).toHaveCount(0)
      expect(await readDataLayer(page)).toEqual([])
    })
  }
})
