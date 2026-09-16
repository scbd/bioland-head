/**
 * Site Context Types
 * Single source of truth for context structure across client and server
 */

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
 * DMSM site configuration from the multi-site management API
 */
export interface DmsmConfig {
  defaultLocale: string
  locales: string[]
  country?: string
  countries?: string[]
  redirect?: string
  published?: boolean
  logo?: string
  theme?: {
    color?: {
      primary?: string
      secondary?: string
    }
    i18n?: {
      maxLangBeforeWrap?: number
    }
  }
  runTime?: Record<string, unknown>
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
