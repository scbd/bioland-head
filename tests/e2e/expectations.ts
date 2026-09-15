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
   * widgets and its mega menu carries the biosafety sections.
   */
  isBiosafety: boolean

  /** Tenant configures a hero image, so the hero element carries a `background-image`. */
  hasHeroBackgroundImage: boolean

  /** Tenant has node pages that render the body side image (`#page-body-side-image-img`). */
  hasSideImages: boolean
}

const BIOSAFETY_LOCALES = ['en', 'ar', 'es', 'fr', 'ru', 'zh'] as const

const EXPECTATIONS: Record<E2ETarget, TargetExpectations> = {
  // Biosafety Seed (GT) - the BCH tenant the bl-576-bsl specs were originally written against.
  seed: {
    siteCode: 'seed',
    homeTitle: /Biosafety Seed \(GT\)/,
    locales: BIOSAFETY_LOCALES,
    isBiosafety: true,
    hasHeroBackgroundImage: true,
    hasSideImages: true,
  },

  // Second biosafety tenant, same content shape as `seed`. Its exact site title is not
  // pinned here because the tenant was not reachable to probe; the pattern is written to
  // be mutually exclusive with `seed` so a `bsl` run pointed at the seed host fails loudly
  // instead of passing on a substring match.
  bsl: {
    siteCode: 'bsl',
    homeTitle: /^(?!.*Biosafety Seed \(GT\)).*Biosafety/s,
    locales: BIOSAFETY_LOCALES,
    isBiosafety: true,
    hasHeroBackgroundImage: true,
    hasSideImages: true,
  },

  // Default target: the ASEAN Clearing House Mechanism tenant. A CHM site, not a
  // biosafety one - it renders `widget-content-types-stats` and no `home-bch-*` widgets,
  // serves the ASEAN locale set, and configures no hero or side image.
  e2e: {
    siteCode: 'e2e',
    homeTitle: /ASEAN Clearing House Mechanism/,
    locales: ['en', 'vi', 'th', 'lo', 'km', 'zh', 'ms'],
    isBiosafety: false,
    hasHeroBackgroundImage: false,
    hasSideImages: false,
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
