/**
 * Site Context Types
 * Single source of truth for context structure across client and server
 */

import type { SiteTheme, SiteRunTime } from './site-config'

/**
 * Minimal context stored in cookie for SSR hydration
 * Keep this small to minimize request/response size
 */
export interface ContextCookie {
  siteCode: string
  locale: string
  defaultLocale: string
}

/**
 * DMSM site configuration from the multi-site management API.
 *
 * Field inventory, presence counts, and the never-ship rules are pinned in
 * docs/specs/site-config-contract.md (p01-01). This interface models the full per-site domain
 * object the successor registry read produces (per that spec's "DmsmConfig successor" table),
 * NOT only the subset a browser may see — `SiteContext`/the public projection is where the
 * public/secret split is enforced. Secret multiSite-level fields (`dataBase`, `dns`, `drupal`,
 * `auth`, `defaultSmtpCredentials`, `panoramaKey`) and PII (`meta`) are deliberately absent from
 * this type by design; they live only on `MultiSiteConfigInput` / `SiteConfigInput`
 * (shared/types/site-config.ts), the pre-projection input shapes.
 */
export interface DmsmConfig {
  // Identifiers
  siteCode?: string
  multiSiteCode?: string
  name?: string
  description?: string
  host?: string

  defaultLocale: string
  locales: string[]

  // Geographic (optionality per the observed corpus: country 208/211, countries 170/211)
  country?: string
  countries?: string[]
  continent?: string
  region?: string

  // Environment
  env?: string

  // Lifecycle / grouping flags
  published?: boolean
  migrated?: boolean
  /** Stripped from any public payload (R2) — present here because this type also backs
   * server-side reads, not only what a browser receives. */
  migratedFailed?: boolean
  /** Stripped from any public payload (R2). */
  aliases?: string[]

  /**
   * `hasBl1` decision (R3, docs/specs/site-config-contract.md): the wire is inconsistent today —
   * `boolean | string` across 145/211 bl2 sites, absent on the rest. This type is HONEST rather
   * than normalized: it types what the current DMSM response actually carries. R3 says the
   * eventual registry read normalizes string -> boolean (truthy on "true"/"1"/"yes",
   * case-insensitively, after trimming; false otherwise, including on absence) and emits it
   * unconditionally as a `boolean` — but that normalization is registry/projection-side work
   * (a later phase), not a change this types-only task makes to today's runtime behavior. Do not
   * silently widen or narrow this field without also changing the runtime that produces it.
   */
  hasBl1?: boolean | string
  /** Stripped from any public payload (R2). */
  hasBl2?: boolean

  redirect?: string
  logo?: string

  /**
   * The `i18n` collision (R4, docs/specs/site-config-contract.md): three things share the name
   * `i18n` and only two are real. THIS field is the site-level boolean (31/211 bl2 sites) — a
   * plain flag, not the wrap-threshold object. The wrap threshold lives at
   * `theme.i18n.maxLangBeforeWrap` (see `SiteTheme.i18n`). `runTime.i18n` (see `SiteRunTime.i18n`)
   * is a third, currently-empty name that resolves to `undefined` because nothing produces it.
   * The three are kept as separate fields under separate paths deliberately — R4 forbids unioning
   * them into one.
   */
  i18n?: boolean

  scbd?: boolean
  geoBonPage?: string
  hideHomePageWidgets?: {
    geobon: boolean
  }

  theme?: SiteTheme

  runTime?: SiteRunTime
}

/**
 * Drupal `bioland.settings`, passed through whole by dmsm but filtered at the head boundary by
 * `sanitizeBiolandSettings` (see server/utils/bioland-settings.ts, BL-890) before being camelCased
 * to depth 7 in `buildSiteContext`. Only the allowlisted top-level keys below survive, under the
 * canonical spelling that module emits, so the Drupal key `google_analytics_ids` arrives as
 * `googleAnalyticsIds`.
 *
 * The VALUES are still editor-authored and therefore still untrusted: the allowlist governs which
 * top-level keys exist, not what is inside them. Read the one field you need by name, never spread.
 * Keep this interface in step with BIOLAND_SETTINGS_ALLOWLIST - it is documentation of that
 * allowlist, not an enforcement of it.
 */
export interface BiolandSettings {
  theme?: Record<string, unknown>
  config?: Record<string, unknown>
  googleAnalyticsIds?: string
  homeWidgets?: Record<string, unknown>
  megaMenu?: Record<string, unknown>
}

/**
 * Full site context resolved on server and hydrated to client
 */
export interface SiteContext {
  // Core identifiers
  siteCode: string
  identifier: string
  multiSiteCode: string
  env: string

  // Locale
  locale: string
  defaultLocale: string
  locales: string[]
  indexLocale: string

  // Hosts
  host: string
  localizedHost: string
  baseHost: string

  // Geographic
  country?: string
  countries: string[]

  // Site metadata
  siteName?: string
  redirect?: string
  isBchSite: boolean
  homePath?: string

  // Full DMSM config for advanced use
  config?: DmsmConfig

  // Drupal bioland.settings, camelCased to depth 7. Only the fields we consume are typed.
  biolandSettings?: BiolandSettings
}

/**
 * Cache key for DMSM config storage. Shape: `dmsm-config-<env>-<multiSiteCode>-<siteCode>`.
 *
 * Shared by both `server/utils/context-unified.ts` call sites that key a DMSM config read
 * (the `cachedFunction` persistent cache and the in-flight-request coalescing map) so the
 * two never drift into different key shapes again.
 *
 * `env` is required even though a single container serves a single env: the Nitro FS cache
 * volume (`nuxt.config.ts` `storage.cache` base `./cache`) may be shared across envs, so an
 * env-less key would collide the moment that volume is reused across `dev`/`stg`/`prod`.
 */
export function getDmsmCacheKey(env: string, multiSiteCode: string, siteCode: string): string {
  return `dmsm-config-${env}-${multiSiteCode}-${siteCode}`
}
