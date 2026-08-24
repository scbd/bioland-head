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
 * `app/plugins/site.js` fetches `/api/context/{siteCode}/{locale}` and hands the response straight
 * to `siteStore.initialize`. That plugin runs on the CLIENT as well as during SSR, so the browser
 * makes that request and Playwright can intercept it. The spec injects an author-shaped
 * `biolandSettings.theme` into that response. Two runs against the same route:
 *
 *   1. Baseline, no interception — capture what the site renders today.
 *   2. Injected — assert the authored leaves changed and the unauthored leaves did not.
 *
 * Asserting run 2 against run 1 rather than against hardcoded colours keeps the spec valid as the
 * network theme evolves. No live site carries an authored theme today, so run 1 is by definition
 * the fall-through render.
 *
 * ## Two defects this spec was rewritten to fix (BL-886 gate, first ever execution)
 *
 * 1. **It injected into the wrong key.** The original fixture wrote
 *    `config.runTime.biolandSettings.theme`. `app/stores/site.js` deliberately does NOT read the
 *    theme from there (see the comment above its `theme` getter) — it reads the top-level
 *    `biolandSettings` handed through `initialize`. Nothing the old fixture wrote could ever have
 *    reached the page.
 *
 * 2. **The fixture colour collided with the tenant.** It authored `#7b6f82`, which is the target
 *    tenant's OWN live primary. That hid defect 1 entirely: `toContain(authored)` passed
 *    trivially because the page painted that colour with nothing injected. The spec could not
 *    tell an injected value from a baseline one, so it proved nothing about the feature it exists
 *    to prove.
 *
 * Three things keep that from recurring:
 *
 *   - The fixture uses a synthetic sentinel colour no brand palette would carry.
 *   - The spec ASSERTS the sentinel is absent from the baseline render before asserting it took
 *     effect, so a future tenant-theme change fails loudly rather than silently hollowing the
 *     spec out again.
 *   - The fixture authors `color.primary` ONLY. `color.secondary` is deliberately left unauthored
 *     so there is an observable fall-through leaf. Authoring both colours, as the original did,
 *     left the fall-through half of the test name with nothing to observe.
 *
 * ## Why the fixture does not also author `megaMenu.maxColumns`
 *
 * An earlier draft of this fixture authored `megaMenu.maxColumns: 4` alongside the colour, but
 * nothing observed it - inert fixture data that would still pass if the resolver stopped honouring
 * `maxColumns` entirely. It was dropped rather than asserted: `maxColumns` has no CSS-variable or
 * inline-style projection (see `useTheme` / `app/composables/theme.js`) - its only DOM effect is
 * structural, in `app/components/page/header/mega-menu/drop-down.vue`, where it caps how many
 * `.menu-section` elements get bin-packed into each `.mm-row`. That dropdown is `v-if`-gated
 * behind a top-level nav toggle, so it is absent from the page until a specific menu item is
 * opened, and whether 4 vs. the default 5 columns produces a different row count depends on that
 * menu's live section count - data this spec does not control and would have to separately
 * intercept and fabricate to make the assertion reliably discriminating. Doing that would assert on
 * invented menu data instead of the real page, and the only way to read the result is counting
 * elements by selector, which is exactly the DOM-structure coupling this suite avoids. `color.primary`
 * already proves the per-leaf merge reaches the page; a second, harder-to-land leaf on a different
 * contract group is not worth that cost.
 *
 * ## Header caveat
 *
 * When fulfilling with a modified body, the inherited `content-encoding` and `content-length`
 * headers are dropped. Re-using them ships a plain-JSON body labelled gzip with the wrong length,
 * which fails behind a gzip proxy while passing locally. See `stripBodyHeaders`.
 */

test.use({
  baseURL: getE2EBaseURL(),
})

/**
 * Author-shaped theme, post-camelCase — the shape context-unified.ts hands to the app.
 *
 * `color.primary` is a synthetic sentinel, not a plausible brand colour, so it cannot coincide
 * with whatever the target tenant already paints. `color.secondary` is intentionally ABSENT: it is
 * the fall-through leaf this spec observes.
 */
const AUTHORED_THEME = {
  color: { primary: '#ff00e7' },
}

/** The context payload the site plugin initialises the store from. */
const CONTEXT_ROUTE = '**/api/context/**'

/**
 * Headers that describe the ORIGINAL body and must not be carried onto a modified one.
 * `content-length` would be wrong; `content-encoding` would claim a compression that is not there.
 */
const stripBodyHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).filter(([name]) => !['content-encoding', 'content-length'].includes(name.toLowerCase())),
  )

/** Intercept the context response and hand `mutate` the parsed payload to edit in place. */
const interceptContext = (page: any, mutate: (context: any) => void) =>
  page.route(CONTEXT_ROUTE, async (route: any) => {
    const response = await route.fetch()
    const context  = await response.json()

    mutate(context)

    await route.fulfill({
      status     : response.status(),
      headers    : stripBodyHeaders(response.headers()),
      contentType: 'application/json',
      body       : JSON.stringify(context),
    })
  })

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

  // Each spec loads the route twice against a `nuxt dev` server, so the first compile alone can
  // outrun Playwright's 30s default. This is slowness, not flake — the waits stay deterministic.
  test.describe.configure({ timeout: 120_000 })

  test('an authored theme wins on its own leaves and falls through on the rest', async ({ page }) => {
    // ---- Run 1: baseline. No site on the fleet authors a theme, so this is the fall-through render.
    await page.goto('/', { waitUntil: 'networkidle' })

    const baseline = await readThemeVars(page)

    expect(baseline.primary.length, 'baseline must expose a primary colour to compare against').toBeGreaterThan(0)
    expect(baseline.background.length, 'baseline must expose a background colour to compare against').toBeGreaterThan(0)

    // ---- Fixture guard. If the tenant already paints the sentinel, every assertion below would be
    // satisfied by the baseline alone and the spec would prove nothing. Fail here, loudly, instead.
    expect(baseline.primary, 'fixture primary collides with the tenant rendered primary — pick another sentinel')
      .not.toContain(AUTHORED_THEME.color.primary)
    expect(baseline.background, 'fixture primary collides with a rendered background — pick another sentinel')
      .not.toContain(toRgb(AUTHORED_THEME.color.primary))

    // ---- Run 2: inject an authored theme into the context response.
    await interceptContext(page, (context) => {
      context.biolandSettings = { ...(context.biolandSettings || {}), theme: AUTHORED_THEME }
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    const themed = await readThemeVars(page)

    // Authored leaf wins: the sentinel primary is what the page now paints with. Because the guard
    // above proved the baseline did not carry it, this can only have come from the injection —
    // neutralise the authored leg and this assertion fails.
    expect(themed.primary, 'the authored primary did not reach the rendered page')
      .toContain(AUTHORED_THEME.color.primary)
    expect(themed.primary, 'the themed render is indistinguishable from the baseline')
      .not.toEqual(baseline.primary)

    // Unauthored leaf falls through: `color.secondary` was never authored, so every background the
    // tenant painted at baseline — the secondary `bgStyle` drives among them — must still be there.
    expect(themed.background, 'an unauthored secondary should have fallen through to the tenant value')
      .toEqual(expect.arrayContaining(baseline.background))
  })

  test('a site with no authored theme renders exactly as it does today', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })

    const before = await readThemeVars(page)

    // biolandSettings present but carrying no `theme` key — the whole fleet's current state.
    await interceptContext(page, (context) => {
      context.biolandSettings = { ...(context.biolandSettings || {}) }
      delete context.biolandSettings.theme
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    expect(await readThemeVars(page)).toEqual(before)
  })
})
