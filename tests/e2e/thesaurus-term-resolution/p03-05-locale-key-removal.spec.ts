import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from '../e2e-targets'
import { seedConsentCookies } from '../helpers/seed-consent-cookies'

/**
 * BL-998 (p03-05) — no visible label regression after deleting the manifest-safe keys from every
 * locale file.
 *
 * ## Why this, not a new fixture/route
 *
 * The task's own instruction is to reuse `p03-02`/`p03-03`'s E2E fixtures/routes rather than invent
 * new ones — the point here is proving the DELETION is safe GIVEN those cutovers, not re-testing the
 * cutovers themselves. This spec walks the exact same search-results route
 * (`page/list/row.vue`, resolved via `/api/menus/system-pages` the same way
 * `p03-03-subject-labels.spec.ts` does) and asserts both the country badge (`BL-995`) and the
 * subject/bchSubject badges (`BL-996`) still render resolved text — not empty, not a raw GUID, and
 * not a bare `CBD-SUBJECT-*`/ISO-2 identifier — in one UN locale and one non-UN locale. Those badges
 * are driven entirely by `useTermLabel` (the resolver), which never reads `i18n/locales/*.json` for
 * these families, so a pass here is direct evidence the key deletion did not silently blank or
 * raw-identifier-leak anything a user would see.
 */

test.use({ baseURL: getE2EBaseURL() })

/** A bare UUID — the D5 miss-fallback renders the raw GUID identifier verbatim on a miss. */
const RAW_GUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/
/** The D5 miss-fallback for a CBD-thesaurus subject renders the bare slug verbatim. */
const RAW_SUBJECT_SLUG = /^CBD-SUBJECT-/
/** A bare ISO-2 code — the D5 miss-fallback for a country renders this verbatim on a miss. */
const RAW_ISO2 = /^[a-z]{2}$/i

/** `systemPageTidConstants.SEARCH` (`shared/utils/constants.ts:342`) — the main search system page. */
const SEARCH_SYSTEM_PAGE_TID = 21

/** One UN language and one non-UN language, per the task's acceptance criteria. */
const LOCALES = ['fr', 'de'] as const

/** Resolve the locale-prefixed search-results path the same way `p03-03-subject-labels.spec.ts` does. */
async function resolveSearchPath(request: import('@playwright/test').APIRequestContext, baseURL: string, locale: string): Promise<string> {
  const response = await request.get(`${baseURL}/api/menus/system-pages`)

  expect(response.ok(), 'the system-pages menu API must respond for the spec to resolve a route').toBeTruthy()

  const pages = (await response.json()) as Array<{ drupalInternalTid?: number; aliases?: Record<string, string> }>
  const searchPage = pages.find((p) => p.drupalInternalTid === SEARCH_SYSTEM_PAGE_TID)
  const alias = searchPage?.aliases?.[locale] || '/search'

  return `/${locale}${alias.startsWith('/') ? alias : `/${alias}`}`
}

function assertResolvedLabel(text: string | null, where: string) {
  const value = (text || '').trim()

  expect(value.length, `${where}: badge must not render empty after key deletion`).toBeGreaterThan(0)
  expect(value, `${where}: must not render a raw GUID (D5 miss-fallback — deletion broke a consumer)`).not.toMatch(RAW_GUID)
  expect(value, `${where}: must not render a bare CBD-SUBJECT-* slug (D5 miss-fallback)`).not.toMatch(RAW_SUBJECT_SLUG)
  expect(value, `${where}: must not render a bare ISO-2 code (D5 miss-fallback)`).not.toMatch(RAW_ISO2)
}

test.describe('no visible label regression after locale-key deletion (BL-998)', () => {
  test.describe.configure({ timeout: 120_000 })

  for (const locale of LOCALES) {
    test(`search results (page/list/row.vue) still resolve country + subject badges — ${locale}`, async ({ page, request, context }) => {
      const baseURL = getE2EBaseURL()

      await seedConsentCookies(context, baseURL)

      const searchPath = await resolveSearchPath(request, baseURL, locale)
      await page.goto(searchPath, { waitUntil: 'networkidle' })

      const countryBadges = page.locator('a[href*="cbd.int/countries/?country="]')
      const countryCount = await countryBadges.count()
      for (let i = 0; i < countryCount; i++) {
        assertResolvedLabel(await countryBadges.nth(i).textContent(), `country badge #${i} (${locale})`)
      }

      const subjectBadges = page.locator('[id*="-subject-"], [id*="-bch-subject-"]')
      const subjectCount = await subjectBadges.count()
      for (let i = 0; i < subjectCount; i++) {
        assertResolvedLabel(await subjectBadges.nth(i).textContent(), `subject badge #${i} (${locale})`)
      }

      test.skip(countryCount === 0 && subjectCount === 0, `no country- or subject-tagged search result in this run's content for locale "${locale}"`)
    })
  }
})
