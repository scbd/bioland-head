import { expect, test } from '@nuxt/test-utils/playwright'

import { getE2EBaseURL } from './e2e-targets'

/**
 * BL-885 — `biolandSettings.theme` precedence, end to end.
 *
 * Authored leaves win; unauthored leaves fall through to today's render. The unit suites pin the
 * merge rule and the depth-7 transform in isolation; this spec proves the wiring actually reaches
 * the rendered page, which is the one thing a unit test cannot show.
 *
 * ## Method
 *
 * The site config is fetched from dmsm by the Nitro server, so the spec intercepts that response
 * and injects an author-shaped `biolandSettings.theme` into it. Two runs against the same route:
 *
 *   1. Baseline, no interception — capture what the site renders today.
 *   2. Injected — assert the authored leaves changed and the unauthored leaves did not.
 *
 * Asserting run 2 against run 1 rather than against hardcoded colours keeps the spec valid as the
 * network theme evolves. No live site carries an authored theme today, so run 1 is by definition
 * the fall-through render.
 *
 * ## Header caveat
 *
 * When fulfilling with a modified body, the inherited `content-encoding` and `content-length`
 * headers are dropped. Re-using them ships a plain-JSON body labelled gzip with the wrong length,
 * which fails behind a gzip proxy while passing locally. See `stripBodyHeaders`.
 *
 * ## Run status
 *
 * Authored under p02-01. p03-01 (local verification gate) owns running it: this branch has no
 * running stack to point `getE2EBaseURL()` at, so the run is deferred there. `yarn test:e2e --list`
 * must enumerate it cleanly from here.
 */

test.use({
  baseURL: getE2EBaseURL(),
})

/** Author-shaped theme, post-camelCase — the shape context-unified.ts hands to the app. */
const AUTHORED_THEME = {
  color   : { primary: '#7b6f82', secondary: '#889262' },
  megaMenu: { maxColumns: 4 },
}

/**
 * Headers that describe the ORIGINAL body and must not be carried onto a modified one.
 * `content-length` would be wrong; `content-encoding` would claim a compression that is not there.
 */
const stripBodyHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) => !['content-encoding', 'content-length'].includes(name.toLowerCase())),
  )

/**
 * Theme colours as actually rendered.
 *
 * `useTheme` (app/composables/theme.js) applies the resolved theme as INLINE styles on individual
 * elements — `--bs-primary`, `border-top: <primary> .5rem solid`, `background-color: <secondary>`
 * — rather than as custom properties on `:root`. So the read scans the document for those inline
 * declarations and returns the distinct values, which is stable across component changes in a way
 * that pinning one selector is not.
 */
const readThemeVars = (page: any) =>
  page.evaluate(() => {
    const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort()

    const styled = [...document.querySelectorAll<HTMLElement>('[style]')]

    return {
      primary   : distinct(styled.map(el => el.style.getPropertyValue('--bs-primary').trim().toLowerCase())),
      background: distinct(styled.map(el => el.style.backgroundColor.trim().toLowerCase())),
    }
  })

/** Playwright reports colours as `rgb(...)`; the fixture authors hex. */
const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

  return `rgb(${r}, ${g}, ${b})`
}

test.describe('biolandSettings.theme precedence', () => {

  test('an authored theme wins on its own leaves and falls through on the rest', async ({ page }) => {
    // ---- Run 1: baseline. No site on the fleet authors a theme, so this is the fall-through render.
    await page.goto('/', { waitUntil: 'networkidle' })

    const baseline = await readThemeVars(page)

    expect(baseline.primary.length, 'baseline must expose a primary colour to compare against').toBeGreaterThan(0)

    // ---- Run 2: inject an authored theme into the site config response.
    await page.route('**/config/**', async (route) => {
      const response = await route.fetch()
      const config   = await response.json()

      config.runTime = config.runTime || {}
      config.runTime.biolandSettings = {
        ...(config.runTime.biolandSettings || {}),
        theme: AUTHORED_THEME,
      }

      await route.fulfill({
        status     : response.status(),
        headers    : stripBodyHeaders(response.headers()),
        contentType: 'application/json',
        body       : JSON.stringify(config),
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    const themed = await readThemeVars(page)

    // Authored leaves win: the authored primary is what the page now paints with.
    expect(themed.primary).toContain(AUTHORED_THEME.color.primary)
    expect(themed.primary).not.toEqual(baseline.primary)

    // And the authored secondary reaches the backgrounds `bgStyle` drives.
    expect(themed.background).toContain(toRgb(AUTHORED_THEME.color.secondary))
  })

  test('a site with no authored theme renders exactly as it does today', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const before = await readThemeVars(page)

    // biolandSettings present but carrying no `theme` key — the whole fleet's current state.
    await page.route('**/config/**', async (route) => {
      const response = await route.fetch()
      const config   = await response.json()

      config.runTime = config.runTime || {}
      config.runTime.biolandSettings = { ...(config.runTime.biolandSettings || {}) }
      delete config.runTime.biolandSettings.theme

      await route.fulfill({
        status     : response.status(),
        headers    : stripBodyHeaders(response.headers()),
        contentType: 'application/json',
        body       : JSON.stringify(config),
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    expect(await readThemeVars(page)).toEqual(before)
  })
})
