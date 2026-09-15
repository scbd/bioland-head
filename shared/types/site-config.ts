/**
 * Site config contract types.
 *
 * Companion to `shared/types/context.ts`. This file owns:
 *   - `SiteTheme` / `SiteRunTime` — the shapes `DmsmConfig` (context.ts) is built from, factored
 *     out here because the registry-input types below (`SiteConfigInput`, `MultiSiteConfigInput`)
 *     also reference the theme shape.
 *   - `SiteConfigInput` / `MultiSiteConfigInput` — the INPUT half of the config-endpoint contract:
 *     the raw, unfiltered shapes a future registry reader hands to the projection that builds
 *     `DmsmConfig`. They exist so `p02-03` (the projection) can be written against a type surface
 *     here rather than importing a schema from `p02-01`, keeping the two independent.
 *
 * Full field inventory, presence counts, and the never-ship rules: docs/specs/site-config-contract.md
 * (produced by p01-01). Nothing in this file changes `fetchDmsmConfigCore()` or its callers, and
 * nothing here is imported by anything on the request path.
 */

import type { BiolandSettings } from './context'

/**
 * The two-level theme object. Used by `DmsmConfig.theme` (site level, resolved), by
 * `MultiSiteConfigInput.theme` (network-level default), and by `SiteConfigInput.theme`
 * (per-site override) — per R6 in the contract spec, the per-site branch replaces the
 * multiSite branch whole, per top-level branch; branches are never deep-merged.
 *
 * Group contents (`color`, `hero`, `text`, `backGround`, `megaMenu`, `homePageWidgets`) are typed
 * loosely as `Record<string, unknown>` rather than leaf-by-leaf: `app/utils/resolve-theme.js`
 * (the canonical theme resolver) treats unknown groups/leaves as pass-through by design, so a
 * closed leaf-level type here would fight that resolver's contract rather than describe it.
 * `i18n` is the one group typed to the leaf, because it is the field the `i18n` collision (R4)
 * concerns.
 */
export interface SiteTheme {
  color?: Record<string, unknown>
  hero?: Record<string, unknown>
  text?: Record<string, unknown>
  backGround?: Record<string, unknown>
  megaMenu?: Record<string, unknown>
  homePageWidgets?: Record<string, unknown>
  /** The wrap-threshold leg of the `i18n` collision — see R4 and `DmsmConfig.i18n`'s JSDoc. */
  i18n?: {
    maxLangBeforeWrap?: number
  }
  /** `bsl` multiSite only (2/2 there, 0/2 elsewhere in the observed corpus). */
  canAutoTranslate?: boolean
}

/**
 * The public members of derived `runTime` (Level 3 in the contract spec), i.e. what a consumer
 * inside this repo may actually rely on. `mapRunTimeMultiSiteSite` builds the full `runTime` from
 * the multiSite `config`, then the site-level public allowlist filters it; the members below are
 * the survivors. Every non-public/secret/internal member (`root`, `drupalRoot`, `siteRoot`,
 * `dataBaseName`, `dataBase`, `dns`, `smtpCredentials`, `cdn`, `baseHost`) is deliberately ABSENT
 * from this type, by design, per R2 of the contract spec — they must never reach a browser, and
 * this repo has no legitimate reason to read them even server-side.
 */
export interface SiteRunTime {
  env?: string
  multiSiteCode?: string
  host?: string
  countries?: string[]
  theme?: SiteTheme
  country?: string
  /**
   * Always `undefined` today (R4): `runTime.i18n` reads `config.i18n`, which does not exist at
   * the multiSite level in the observed corpus. Typed `undefined`-only rather than dropped, so a
   * future producer of this field is a visible type change, not a silent addition. The wrap
   * setting lives at `theme.i18n.maxLangBeforeWrap`, not here — see the collision note on
   * `DmsmConfig.i18n`.
   */
  i18n?: undefined
  /**
   * Always `undefined` today (R5): `settings` is allowlisted at the multiSite level but never
   * observed in the corpus, and it is not in the site-level allowlist either, so it is stripped
   * from `runTime` even on the rare chance it is ever populated upstream. A phantom field by two
   * independent mechanisms — kept here, typed `undefined`-only, so removing the dead destructure
   * (tracked as debt in p04-04) is a visible type change rather than a silent one.
   */
  settings?: undefined
  /**
   * Assigned by `addBiolandSettings` AFTER the site-level allowlist filter runs, so no multiSite
   * allowlist governs it — see `server/utils/bioland-settings.ts` (BL-890) for the head-side
   * `sanitizeBiolandSettings` allowlist that is the only filter over it today.
   */
  biolandSettings?: BiolandSettings
}

/**
 * The per-site record shape as a future registry reader would hand it to the projection that
 * builds `DmsmConfig` — i.e. BEFORE the public allowlist runs. This is deliberately WIDER than
 * `DmsmConfig`: it carries fields R2 says must be stripped before anything public
 * (`aliases`, `hasBl2`, `migratedFailed`, `meta`), because a filter needs to see what it is
 * filtering. Never serve a `SiteConfigInput` directly; always project it into `DmsmConfig`-shaped
 * output first.
 */
export interface SiteConfigInput {
  siteCode: string
  multiSiteCode: string
  name: string
  published?: boolean
  redirect?: string
  logo?: string
  defaultLocale: string
  locales: string[]
  continent?: string
  region?: string
  country?: string
  countries?: string[]
  theme?: SiteTheme
  hideHomePageWidgets?: {
    geobon: boolean
  }
  /**
   * Raw wire value, `boolean | string`, honest per R3 — the registry-side normalizer that turns
   * this into a plain `boolean` (per R3's trim/case-insensitive rule) is projection code, not a
   * type in this file. See `DmsmConfig.hasBl1` for the same decision on the output side.
   */
  hasBl1?: boolean | string
  migrated?: boolean
  /** Site-level flag — see the `i18n` collision note on `DmsmConfig.i18n`. */
  i18n?: boolean
  scbd?: boolean
  host?: string
  geoBonPage?: string
  description?: string
  /** Stripped before the public projection (R2) — present here because this is the input side. */
  aliases?: string[]
  /** Stripped before the public projection (R2). */
  hasBl2?: boolean
  /** Stripped before the public projection (R2). */
  migratedFailed?: boolean
  /**
   * PII — `{email, uid}` under both `createdBy` and `updatedBy` (R2, "never-ship"). Present here
   * only because this is the pre-filter input shape; a projection MUST NOT copy this field
   * forward.
   */
  meta?: {
    created?: string
    updated?: string
    createdBy?: { email?: string; uid?: string | number }
    updatedBy?: { email?: string; uid?: string | number }
  }
}

/**
 * The multiSite-level `config` block as a future registry reader would hand it over — i.e. Level 1
 * of the contract spec, BEFORE `publicMultiSiteProperties` filters it down to
 * `multiSiteCode` / `name` / `description` / `baseHost` / `settings` / `theme`.
 *
 * This type carries every multiSite-level SECRET (`dataBase`, `dns`, `drupal`, `auth`,
 * `defaultSmtpCredentials`, `panoramaKey`) and PII (`meta`) field named in R2's never-ship list.
 * Their presence here is deliberate and dangerous: a `MultiSiteConfigInput` must never be
 * serialized, logged, or forwarded whole. It exists only so the projection (p02-03) has a type to
 * read from before it builds the public, include-list output. Callers must read one field at a
 * time by name — never spread or serialize this type.
 */
export interface MultiSiteConfigInput {
  multiSiteCode: string
  name: string
  description?: string
  baseHost: string
  theme?: SiteTheme
  /** Allowlisted but never observed in the corpus (0/2) — see R5. */
  settings?: unknown
  prePublishedBaseHost?: string
  cdn?: string
  gaiaApi?: string
  dmsmApi?: string
  drupalImageName?: string
  headImageName?: string
  drupalImageVersion?: string
  headImageVersion?: string
  showBl1Link?: boolean
  /** Secret (R2). Never forward to a public payload. */
  panoramaKey?: string
  /** Secret (R2). Never forward to a public payload. */
  dataBase?: Record<string, unknown>
  /** Secret (R2). Never forward to a public payload. */
  dns?: Record<string, unknown>
  /** Secret (R2). Never forward to a public payload. */
  drupal?: Record<string, unknown>
  /** Secret (R2) — a service URI, not one of the task's original six but listed for completeness. */
  auth?: Record<string, unknown>
  /** Secret (R2). Never forward to a public payload. */
  defaultSmtpCredentials?: Record<string, unknown>
  /** PII (R2) — `{email, uid}` under both `createdBy` and `updatedBy`. Never forward. */
  meta?: {
    created?: string
    updated?: string
    createdBy?: { email?: string; uid?: string | number }
    updatedBy?: { email?: string; uid?: string | number }
  }
}
