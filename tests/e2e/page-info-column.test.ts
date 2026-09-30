import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

/**
 * BL-1287 - the page info column follows `biolandSettings.theme.page.infoColumn`, on every tenant.
 *
 * With no setting the column sits in the left (side) mount, on CHM and Biosafety tenants alike.
 * With `right` it floats inside the body instead. The hostname no longer decides.
 *
 * The spec runs on whichever tenant `E2E_TARGET` selects (`e2e`/`seed` are CHM, `bsl` is
 * Biosafety), so running it once per target covers both layouts. The setting is injected into the
 * `/api/context` response exactly as `theme-precedence.test.ts` does. Requests send
 * `Accept: text/html` so the page route is not answered as JSON.
 *
 * No fixture page path is hardcoded: the spec walks the home page's internal links until one
 * renders the page body, so it survives content changes on the tenant.
 */

test.use({
  baseURL: getE2EBaseURL(),
  extraHTTPHeaders: { Accept: 'text/html' },
})

const CONTEXT_ROUTE = '**/api/context/**'
const SIDE_MOUNT    = '#page-body-tags-date-side-desktop'
const FLOAT_MOUNT   = '#page-body-tags-date-desktop'
const MAX_CANDIDATES = 15

const stripBodyHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) => !['content-encoding', 'content-length'].includes(name.toLowerCase())),
  )

const setInfoColumn = (page: any, infoColumn?: string) =>
  page.route(CONTEXT_ROUTE, async (route: any) => {
    const response = await route.fetch()
    const context  = await response.json()

    context.biolandSettings = { ...(context.biolandSettings || {}) }

    if (infoColumn) context.biolandSettings.theme = { ...(context.biolandSettings.theme || {}), page: { infoColumn } }

    await route.fulfill({
      status     : response.status(),
      headers    : stripBodyHeaders(response.headers()),
      contentType: 'application/json',
      body       : JSON.stringify(context),
    })
  })

/** Find a same-origin content page that renders the page body; returns its path. */
const findBodyPage = async (page: any): Promise<string> => {
  await page.goto('/en', { waitUntil: 'networkidle' })

  const hrefs: string[] = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')].map(a => a.getAttribute('href') || ''))]
      .filter(href => href.length > 4 && !href.includes('#')))

  for (const href of hrefs.slice(0, MAX_CANDIDATES)) {
    await page.goto(href, { waitUntil: 'networkidle' })

    if (await page.locator('#page-body-content').count()) return href
  }

  throw new Error('No content page rendering #page-body-content was reachable from the home page')
}

test.describe('page info column placement', () => {
  test.describe.configure({ timeout: 180_000 })

  test('no setting: column is in the side mount, not the float mount', async ({ page }) => {
    await setInfoColumn(page)

    const path = await findBodyPage(page)

    await page.goto(path, { waitUntil: 'networkidle' })

    await expect(page.locator(SIDE_MOUNT)).toHaveCount(1)
    await expect(page.locator(FLOAT_MOUNT)).toHaveCount(0)
  })

  test('theme right: column floats in the body, side mount is gone', async ({ page }) => {
    await setInfoColumn(page)

    const path = await findBodyPage(page)

    await page.unroute(CONTEXT_ROUTE)
    await setInfoColumn(page, 'right')
    await page.goto(path, { waitUntil: 'networkidle' })

    await expect(page.locator(SIDE_MOUNT)).toHaveCount(0)
    // The float mount is media-gated, so a media page has neither; the finder above prefers plain pages.
    await expect(page.locator(FLOAT_MOUNT)).toHaveCount(1)
  })
})
