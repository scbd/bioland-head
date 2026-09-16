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

// BL-1015 removed the deployment gate (prod-only, a `<siteCode>.chm-cbd.net` host template per
// multisite, dmsm's `published` flag). The Drupal checkbox is the only control now, so these tests
// run on whatever host the dev server is already bound to: no `--host-resolver-rules` mapping, no
// alias host, and no environment name anywhere. The only conditions that vary are the switch, the
// visitor's consent, and the configured tag IDs.

interface ContextOverrides {
  /** `bioland.settings.google_analytics_enabled`. Deliberately accepts malformed API values. */
  enabled?: unknown
}

type NuxtRoot = HTMLElement & {
  __vue_app__?: { $nuxt?: {
    isHydrating: boolean
    callHook: (name: string, args: Record<string, string>) => Promise<void>
  } }
}

async function waitForSiteInitialization (page: Page): Promise<void> {
  // The async site plugin must finish before a zero-script assertion can prove anything.
  await page.waitForFunction(() => (
    (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt?.isHydrating === false
  ))
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
 * Intercept the client context re-fetch so the administrator's switch and the configured tag IDs
 * are under the test's control, and stub every Google endpoint so no real request is made.
 *
 * `enabled` defaults to `true` because most cases here are about consent, not the switch. The
 * switch cases pass it explicitly. Nothing else in the payload can gate a tag any more.
 */
async function installRoutes (page: Page, overrides: ContextOverrides = {}): Promise<void> {
  await page.route('**/api/context/**', async (route) => {
    const response = await route.fetch()
    const payload = await response.json()

    await route.fulfill({
      json: {
        ...payload,
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
  const domain = new URL(E2E_BASE_URL).hostname

  await context.addCookies([
    { name: '_ga', value: 'GA1.1.111.222', domain, path: '/' },
    { name: `_ga_${GTAG_ID.slice(2)}`, value: 'GS1.1.333', domain, path: '/' },
  ])
}

async function cookieNames (context: BrowserContext): Promise<string[]> {
  return (await context.cookies(E2E_BASE_URL)).map((cookie) => cookie.name)
}

test.describe('BL-933: Google tags follow analytics consent', () => {
  test.describe.configure({ mode: 'serial' })

  test.setTimeout(60000)

  test('(a) consent granted on an eligible site loads each tag exactly once', async ({ context, page }) => {
    await seedConsentCookies(context, E2E_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)

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

    const hostname = new URL(E2E_BASE_URL).hostname
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

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
    expect(await readLoadCount(page)).toBe(1)
  })

  test('(b2) consent for other categories only loads nothing', async ({ context, page }) => {
    const url = `${new URL(E2E_BASE_URL).origin}/`

    await context.addCookies([
      { name: 'ncc_c', value: 'bl2ga', url, sameSite: 'Strict' },
      { name: 'ncc_e', value: 'bl2', url, sameSite: 'Strict' },
    ])

    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)
    await page.waitForLoadState('networkidle')

    await expect(googleScripts(page)).toHaveCount(0)
    expect(await readDataLayer(page)).toEqual([])
  })

  test('(c) revoking consent silences Google, purges its cookies, and reloads once', async ({ context, page }) => {
    await seedConsentCookies(context, E2E_BASE_URL)
    await seedGoogleCookies(context)
    await installPageRecorder(page)
    await installRoutes(page)

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)

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
    await seedConsentCookies(context, E2E_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { enabled: false })

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)
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
      await seedConsentCookies(context, E2E_BASE_URL)
      await installPageRecorder(page)
      await installRoutes(page, { enabled })

      await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page)
      await page.waitForLoadState('networkidle')

      await expect(googleScripts(page)).toHaveCount(0)
      expect(await readDataLayer(page)).toEqual([])
    })
  }

  test('the switch on is sufficient: tags load on the ordinary dev host', async ({ context, page }) => {
    await seedConsentCookies(context, E2E_BASE_URL)
    await installPageRecorder(page)
    await installRoutes(page, { enabled: true })

    await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
    await waitForSiteInitialization(page)

    await expect(googleScripts(page)).toHaveCount(2)
    expect(countConfigCalls(await readDataLayer(page), GTAG_ID)).toBe(1)
  })

  for (const enabled of [false, undefined]) {
    test(`a refetch restoring the switch after ${enabled} resumes tags without duplication or reload`, async ({ context, page }) => {
      const overrides: ContextOverrides = { enabled: true }
      await seedConsentCookies(context, E2E_BASE_URL)
      await installPageRecorder(page)
      await installRoutes(page, overrides)

      await page.goto(`${E2E_BASE_URL}${HOME_PATH}`)
      await waitForSiteInitialization(page)
      await expect(googleScripts(page)).toHaveCount(2)
      const scriptsBefore = await googleScripts(page).elementHandles()

      overrides.enabled = enabled
      // Use the real site plugin's locale-refetch path, retaining the same hydrated store.
      await page.evaluate(async () => {
        const nuxt = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt
        if (!nuxt) throw new Error('Nuxt is not initialized')
        await nuxt.callHook('i18n:beforeLocaleSwitch', { oldLocale: 'en', newLocale: 'fr' })
      })

      await expect.poll(() => page.evaluate(id => (
        (window as unknown as Record<string, unknown>)[`ga-disable-${id}`]
      ), GTAG_ID)).toBe(true)
      expect(await readDataLayer(page)).toContainEqual(['consent', 'update', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      }])

      overrides.enabled = true
      await page.evaluate(async () => {
        const nuxt = (document.querySelector('#__nuxt') as NuxtRoot | null)?.__vue_app__?.$nuxt
        if (!nuxt) throw new Error('Nuxt is not initialized')
        await nuxt.callHook('i18n:beforeLocaleSwitch', { oldLocale: 'fr', newLocale: 'en' })
      })

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
