import { getE2ETarget, type E2ETarget } from './e2e-targets'

/**
 * Per-target expectation fixture (BL-888).
 *
 * The e2e suite resolves its tenant from the request `Host` header, which comes from
 * Playwright's `baseURL` (see `./e2e-targets.ts`). The default target is `e2e`, but many
 * specs were written against the Biosafety Seed (GT) tenant and asserted its content
 * directly, so they could never pass at the default target.
 *
 * Every tenant-specific expectation therefore lives here, keyed on `getE2ETarget()`:
 * a bare `yarn test:e2e` keeps exercising the `e2e` tenant, and setting `E2E_TARGET`
 * switches the target *and* the expectations together.
 *
 * Specs read these values instead of hardcoding tenant strings, and gate tenant-only
 * behaviour with `test.skip(...)` on the capability flags below so a spec that cannot
 * apply to the selected tenant is explicitly skipped rather than silently failing.
 */
export interface TargetExpectations {
  /** DMSM site code for the tenant. Always equal to the target key. */
  siteCode: E2ETarget

  /** Pattern the tenant home page `<title>` must match. */
  homeTitle: RegExp

  /** Locales the tenant serves. Specs that switch language gate on membership here. */
  locales: readonly string[]

  /**
   * Tenant is a Biosafety (BCH/BSL) site: its home page renders the `home-bch-*`
   * widgets and its mega menu carries the biosafety sections in `biosafetyMenus`.
   */
  isBiosafety: boolean

  /** Mega-menu labels that exist only on biosafety tenants. */
  biosafetyMenus: readonly string[]

  /** Tenant configures a hero image, so the hero element carries a `background-image`. */
  hasHeroBackgroundImage: boolean

  /**
   * Tenant mega menu dropdowns link to locale-prefixed internal routes (`/en/...`).
   * A tenant whose menu is built from absolute Drupal URLs exposes no internal link.
   */
  megaMenuHasInternalLinks: boolean

  /** Tenant has node pages that render the body side image (`#page-body-side-image-img`). */
  hasSideImages: boolean

  /**
   * Tenant media host is covered by `image.domains` in `nuxt.config.ts`, so remote card
   * and side images are rewritten through `_ipx`. A tenant outside that allowlist serves
   * its Drupal URLs verbatim, which is correct behaviour, not a regression.
   */
  optimizesRemoteImages: boolean
}

const BIOSAFETY_MENUS = [
  'National Biosafety Framework',
  'Resources',
  'Useful Links',
] as const

const BIOSAFETY_LOCALES = ['en', 'ar', 'es', 'fr', 'ru', 'zh'] as const

const EXPECTATIONS: Record<E2ETarget, TargetExpectations> = {
  // Biosafety Seed (GT) - the BCH tenant the bl-576-bsl specs were originally written against.
  seed: {
    siteCode: 'seed',
    homeTitle: /Biosafety Seed \(GT\)/,
    locales: BIOSAFETY_LOCALES,
    isBiosafety: true,
    biosafetyMenus: BIOSAFETY_MENUS,
    hasHeroBackgroundImage: true,
    megaMenuHasInternalLinks: true,
    hasSideImages: true,
    optimizesRemoteImages: true,
  },

  // Second biosafety tenant, same content shape as `seed`.
  bsl: {
    siteCode: 'bsl',
    homeTitle: /Biosafety/,
    locales: BIOSAFETY_LOCALES,
    isBiosafety: true,
    biosafetyMenus: BIOSAFETY_MENUS,
    hasHeroBackgroundImage: true,
    megaMenuHasInternalLinks: true,
    hasSideImages: true,
    optimizesRemoteImages: true,
  },

  // Default target: the ASEAN Clearing House Mechanism tenant. A CHM site, not a
  // biosafety one - it renders `widget-content-types-stats` and no `home-bch-*` widgets,
  // serves the ASEAN locale set, configures no hero or side image, and its media host
  // (`e2e.bl2.chm-cbd.net`) is outside `image.domains`, so nothing goes through `_ipx`.
  e2e: {
    siteCode: 'e2e',
    homeTitle: /ASEAN Clearing House Mechanism/,
    locales: ['en', 'vi', 'th', 'lo', 'km', 'zh', 'ms'],
    isBiosafety: false,
    biosafetyMenus: [],
    hasHeroBackgroundImage: false,
    megaMenuHasInternalLinks: false,
    hasSideImages: false,
    optimizesRemoteImages: false,
  },
}

/** Expectations for the currently selected target. */
export function getTargetExpectations (): TargetExpectations {
  return EXPECTATIONS[getE2ETarget()]
}

/** True when the selected tenant serves every locale given. */
export function targetServesLocales (...locales: string[]): boolean {
  const served = getTargetExpectations().locales
  return locales.every(locale => served.includes(locale))
}
