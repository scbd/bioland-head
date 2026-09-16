import { test, expect, type Page } from '@playwright/test'

import { getE2EBaseURL } from '../e2e-targets'
import { seedConsentCookies } from '../helpers/seed-consent-cookies'
import { getTargetExpectations } from '../expectations'

/**
 * p03-02 (BL-995): country-label cutover verification.
 *
 * Server-rendered HTML is the only meaningful proof for this task - `useI18n`/`$t` is
 * unreachable from `server/`, so a client-only interaction check cannot show the SSR resolver
 * path (`useTermLabel`, `app/composables/use-term-label.js`) actually ran. This spec:
 *
 * - Reaches the search-results list (`app/components/page/list/row.vue`) via the same UI flow
 *   the app itself uses - the title-search bar's search button, which internally calls
 *   `menusStore.getSystemPagePath({ alias: '/search', locale })` (`app/composables/index.js:57`,
 *   `app/components/page/header/title-search.vue:169`) - rather than hardcoding the search URL.
 * - Also covers `app/components/page/body-tags-date.vue`'s country badge (a document detail
 *   sidebar), reached by following the first search result.
 * - Compares each rendered badge against `/api/thesaurus/terms` (`p02-02`), the same client
 *   resolver endpoint `useTermLabel` itself calls on a miss, so the assertion is independent of
 *   the component under test rather than circular.
 *
 * Content-dependent steps (a country-tagged result existing on this tenant/run) skip with a
 * named reason instead of failing - that is an environment/content condition, not a defect in
 * the cutover.
 */

const E2E_BASE_URL = getE2EBaseURL()
const expectations = getTargetExpectations()

/** UN official languages - used to pick "a UN locale" vs "a non-UN locale" per phase-03's spec. */
const UN_LOCALES = ['ar', 'en', 'es', 'fr', 'ru', 'zh']
/** The three unregistered/most-divergent locale files (phase-03/context.md) - never pick these. */
const NEVER_LOCALES = ['no', 'ps', 'ur']

/**
 * Pick a locale the selected target actually serves (`tests/e2e/expectations.ts`).
 *
 * The default `e2e` target's locale set (`en, vi, th, lo, km, zh, ms`) does not include the
 * task file's illustrative `fr`/`de` - those are only valid against the `seed`/`bsl` targets'
 * `BIOSAFETY_LOCALES`. Deriving the pair from whichever target is actually selected keeps this
 * spec correct under `E2E_TARGET` instead of hardcoding locales one specific tenant serves.
 */
function pickLocale(wantUn: boolean): string | undefined {
  const pool = expectations.locales.filter((l) => !NEVER_LOCALES.includes(l))

  if (wantUn) return pool.find((l) => UN_LOCALES.includes(l) && l !== 'en') ?? pool.find((l) => UN_LOCALES.includes(l))

  return pool.find((l) => !UN_LOCALES.includes(l))
}

const UN_LOCALE = pickLocale(true)
const NON_UN_LOCALE = pickLocale(false)

const BARE_ISO2 = /^[a-z]{2}$/i

/** Reach the search-results page through the app's own search-navigation flow (no hardcoded URL). */
async function goToSearchResults(page: Page, locale: string): Promise<void> {
  await page.goto(`${E2E_BASE_URL}/${locale}`, { waitUntil: 'networkidle' })

  const searchBtn = page.locator(
    '#page-header-title-search-desktop-search-btn, #page-header-title-search-large-search-btn',
  ).first()

  await searchBtn.click()
  await page.waitForLoadState('networkidle')
}

/** The expected localized label, read from the same client resolver endpoint `useTermLabel` calls on a miss. */
async function resolveExpectedLabel(page: Page, identifier: string, locale: string): Promise<string | undefined> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/thesaurus/terms?locale=${locale}`, {
    data: { ids: [identifier] },
  })

  if (!response.ok()) return undefined

  const body = await response.json() as Record<string, { value?: string } | undefined>

  return body?.[identifier]?.value
}

function countryIdentifierFromHref(href: string): string | undefined {
  try {
    return new URL(href).searchParams.get('country') ?? undefined
  } catch {
    return undefined
  }
}

for (const [slot, locale] of [['a UN locale', UN_LOCALE], ['a non-UN locale', NON_UN_LOCALE]] as const) {
  test.describe(`BL-995: country label cutover (${slot})`, () => {
    test.skip(!locale, `target "${expectations.siteCode}" has no locale available for this slot`)

    test.beforeEach(async ({ page }) => {
      await seedConsentCookies(page.context(), E2E_BASE_URL)
    })

    test(`search-results country badge (page/list/row.vue) resolves in ${locale}`, async ({ page }) => {
      await goToSearchResults(page, locale as string)

      const countryLink = page.locator('a[href*="cbd.int/countries/?country="]').first()
      const visible = await countryLink.isVisible({ timeout: 15_000 }).catch(() => false)

      test.skip(!visible, 'no country-tagged search result available to assert against on this tenant/run')

      const href = await countryLink.getAttribute('href') ?? ''
      const identifier = countryIdentifierFromHref(href)

      expect(identifier, `could not parse a country identifier out of "${href}"`).toBeTruthy()

      const badgeText = (await countryLink.innerText()).trim()

      expect(badgeText, 'country badge must not be empty').not.toBe('')
      expect(badgeText, 'country badge must not render the bare ISO-2 code').not.toMatch(BARE_ISO2)

      const expected = await resolveExpectedLabel(page, identifier as string, locale as string)

      test.skip(!expected, `resolver returned no label for "${identifier}" in "${locale}" (p03-01 cache/seed dependency)`)

      expect(badgeText).toBe(expected)
    })

    // Only the UN-locale slot also covers the second site (`body-tags-date.vue`) - the
    // requirement is "row.vue plus one other site", not every site in every locale.
    if (slot === 'a UN locale') {
      test(`document detail country badge (page/body-tags-date.vue) resolves in ${locale}`, async ({ page }) => {
        await goToSearchResults(page, locale as string)

        const resultLink = page.locator('[id^="page-list-row-"] a[id*="-title"], [id^="page-list-row-"] h5 a').first()
        const hasResult = await resultLink.isVisible({ timeout: 15_000 }).catch(() => false)

        test.skip(!hasResult, 'no search result available to open a detail page from on this tenant/run')

        await resultLink.click()
        await page.waitForLoadState('networkidle')

        const countryBadge = page.locator('.cont a[href*="cbd.int/countries/?country="]').first()
        const visible = await countryBadge.isVisible({ timeout: 10_000 }).catch(() => false)

        test.skip(!visible, 'opened detail page has no country tag to assert against on this tenant/run')

        const href = await countryBadge.getAttribute('href') ?? ''
        const identifier = countryIdentifierFromHref(href)

        expect(identifier, `could not parse a country identifier out of "${href}"`).toBeTruthy()

        const badgeText = (await countryBadge.innerText()).trim()

        expect(badgeText, 'country badge must not be empty').not.toBe('')
        expect(badgeText, 'country badge must not render the bare ISO-2 code').not.toMatch(BARE_ISO2)

        const expected = await resolveExpectedLabel(page, identifier as string, locale as string)

        test.skip(!expected, `resolver returned no label for "${identifier}" in "${locale}" (p03-01 cache/seed dependency)`)

        expect(badgeText).toBe(expected)
      })
    }
  })
}
