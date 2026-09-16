import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from '../e2e-targets'
import { seedConsentCookies } from '../helpers/seed-consent-cookies'

/**
 * BL-996 (p03-03) — subject-family labels render through the resolver, not raw i18n.
 *
 * ## What changed
 *
 * Six SFCs (`page/body-tags-date.vue`, `page/list/row.vue`, `widget/index.vue`,
 * `cards/media/{hero,document,image}.vue`) switched their `subjects`/`bchSubjects` badges from
 * `t(identifier)` to `useTermLabel` (p02-06). Server-rendered HTML is the only meaningful proof
 * here — `$t` is unreachable from `server/`, so a passing render is the whole point.
 *
 * ## Method
 *
 * The search-results route (`page/list/row.vue`) is the reliable target: virtually any tenant's
 * search results carry at least one subject-tagged document. It is resolved the same way the app
 * itself resolves it — `menusStore.getSystemPagePath({ id: systemPageTidConstants.SEARCH, locale })`
 * (`shared/utils/constants.ts:342`), replicated here against `/api/menus/system-pages` since a
 * Playwright spec has no Pinia instance of its own — then prefixed with the locale segment the same
 * way `useLocalePath` would (`nuxt.config.ts`'s i18n `strategy: "prefix"` prefixes every locale).
 *
 * Every rendered subject/bchSubject badge is asserted non-empty, not a raw GUID, and not a bare
 * `CBD-SUBJECT-*` slug — the D5 miss-fallback would render exactly one of those if the resolver
 * wiring were broken.
 *
 * A media card (`cards/media/*.vue`) only renders as an "Attachments" swiper section on a content
 * page that has attached media (`page/body/index.vue#page-body-attachments-swiper`), which is
 * genuinely live-content-dependent — no fixture seeds this repo's E2E target. The second test walks
 * a handful of search results looking for one, and skips (rather than fails) if this run's content
 * mix has none, logging why: a live-data gap is not the same claim as "the cutover is broken."
 *
 * ## Locales
 *
 * `fr` (UN language, resolves through the CBD API + `p03-01`'s seed) and `de` (non-UN language,
 * exercising the same path with narrower native API coverage) per the task's acceptance criteria.
 */

test.use({ baseURL: getE2EBaseURL() })

/** A bare UUID — the D5 miss-fallback renders the raw GUID identifier verbatim on a miss. */
const RAW_GUID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

/** The D5 miss-fallback for a CBD-thesaurus subject renders the bare slug verbatim. */
const RAW_SUBJECT_SLUG = /^CBD-SUBJECT-/

/** `systemPageTidConstants.SEARCH` (`shared/utils/constants.ts:342`) — the main search system page. */
const SEARCH_SYSTEM_PAGE_TID = 21

const LOCALES = ['fr', 'de'] as const

/**
 * Resolve the locale-prefixed search-results path the same way the app does: find the SEARCH
 * system page by Drupal term id, read its per-locale Drupal alias, then prefix the locale segment
 * (`strategy: "prefix"` in `nuxt.config.ts` prefixes every locale, default included).
 */
async function resolveSearchPath(request: import('@playwright/test').APIRequestContext, baseURL: string, locale: string): Promise<string> {
  const response = await request.get(`${baseURL}/api/menus/system-pages`)

  expect(response.ok(), 'the system-pages menu API must respond for the spec to resolve a route').toBeTruthy()

  const pages = await response.json() as Array<{ drupalInternalTid?: number, aliases?: Record<string, string> }>
  const searchPage = pages.find((p) => p.drupalInternalTid === SEARCH_SYSTEM_PAGE_TID)
  const alias = searchPage?.aliases?.[locale] || '/search'

  return `/${locale}${alias.startsWith('/') ? alias : `/${alias}`}`
}

/** Every subject/bchSubject badge `page/list/row.vue` renders carries an id containing this. */
const SUBJECT_BADGE_SELECTOR = '[id*="-subject-"], [id*="-bch-subject-"]'

function assertResolvedLabel(text: string | null, where: string) {
  const value = (text || '').trim()

  expect(value.length, `${where}: subject badge must not render empty`).toBeGreaterThan(0)
  expect(value, `${where}: must not render a raw GUID (D5 miss-fallback)`).not.toMatch(RAW_GUID)
  expect(value, `${where}: must not render a bare CBD-SUBJECT-* slug (D5 miss-fallback)`).not.toMatch(RAW_SUBJECT_SLUG)
}

test.describe('subject-family labels render via the resolver (BL-996)', () => {
  test.describe.configure({ timeout: 120_000 })

  for (const locale of LOCALES) {
    test(`search results (page/list/row.vue) — ${locale}`, async ({ page, request, context }) => {
      const baseURL = getE2EBaseURL()

      await seedConsentCookies(context, baseURL)

      const searchPath = await resolveSearchPath(request, baseURL, locale)

      await page.goto(searchPath, { waitUntil: 'networkidle' })

      const badges = page.locator(SUBJECT_BADGE_SELECTOR)
      const count = await badges.count()

      test.skip(count === 0, `no subject-tagged search result in this run's content for locale "${locale}"`)

      for (let i = 0; i < count; i++) {
        assertResolvedLabel(await badges.nth(i).textContent(), `row.vue badge #${i} (${locale})`)
      }
    })
  }

  test('at least one media card (cards/media/hero|document|image.vue) shows a resolved subject label', async ({ page, request, context }) => {
    const baseURL = getE2EBaseURL()
    const locale = 'fr'

    await seedConsentCookies(context, baseURL)

    const searchPath = await resolveSearchPath(request, baseURL, locale)

    await page.goto(searchPath, { waitUntil: 'networkidle' })

    const resultLinks = await page.locator('a[id^="page-list-row-"]').evaluateAll(
      (els) => els.map((el) => (el as HTMLAnchorElement).href),
    )

    // A content page only renders `cards/media/*.vue` when it has attached media
    // (`page/body/index.vue#page-body-attachments-swiper`) — genuinely content-dependent, so this
    // walks a bounded sample of real search results rather than assuming one exists.
    const candidates = resultLinks.slice(0, 15)
    let found = false

    for (const href of candidates) {
      await page.goto(href, { waitUntil: 'networkidle' })

      const mediaSubjectBadges = page.locator('#page-body-attachments-swiper .badge.bg-primary')
      const mediaCount = await mediaSubjectBadges.count()

      if (mediaCount === 0) continue

      found = true
      for (let i = 0; i < mediaCount; i++) {
        assertResolvedLabel(await mediaSubjectBadges.nth(i).textContent(), `media card badge #${i}`)
      }
      break
    }

    test.skip(!found, 'no attached media with subject tags surfaced among the sampled search results in this run')
  })
})
