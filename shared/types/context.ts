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
 * Drupal `bioland.settings`, passed through whole by dmsm and camelCased to depth 7 on the way
 * through `buildSiteContext`, so the Drupal key `google_analytics_ids` arrives as
 * `googleAnalyticsIds`. The bag is an unfiltered passthrough of site editable config, so treat
 * every value in it as untrusted input: read the one field you need by name, never spread it.
 * Only the fields this app consumes are typed; the index signature keeps the rest addressable.
 */
export interface BiolandSettings extends Record<string, unknown> {
  googleAnalyticsIds?: string
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
 * Cache key for DMSM config storage
 */
export function getDmsmCacheKey(env: string, multiSiteCode: string, siteCode: string): string {
  return `dmsm-config-${env}-${multiSiteCode}-${siteCode}`
}
