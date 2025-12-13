/**
 * Unified Server Context Resolution
 * 
 * This is the ONLY way to get site context on the server.
 * Context is resolved once per request and cached on event.context.site
 * 
 * Locale priority: URL path > cookie > DMSM default
 */

import type { H3Event } from 'h3'
import type { SiteContext, DmsmConfig, ContextCookie } from '~/shared/types'

const DMSM_CACHE_TTL = 60 * 60 * 24 // 24 hours in seconds
const DMSM_CACHE_BASE = 'dmsm-config'

interface RequestContextOptions {
  /** Explicit siteCode (skips host extraction) - used by context API route */
  siteCode?: string
  /** Explicit locale (skips path/cookie resolution) */
  locale?: string
}

/**
 * Get site context for the current request
 * Caches result on event.context.site to avoid re-resolution
 * 
 * @param event - H3 event
 * @param options - Optional overrides for siteCode and locale (used by context API route)
 */
export async function useRequestContext(event: H3Event, options?: RequestContextOptions): Promise<SiteContext> {
  const { baseHost, env, multiSiteCode, locales: runtimeLocales } = useRuntimeConfig().public
  
  // If explicit siteCode provided (from route params), use it directly
  // This is for the /api/context/[siteCode]/[locale] route where host may be localhost
  const explicitSiteCode = options?.siteCode
  const explicitLocale = options?.locale
  
  // Create cache key based on whether we have explicit params
  const cacheKey = explicitSiteCode ? `site-${explicitSiteCode}-${explicitLocale || 'default'}` : 'site'
  
  // Return cached context if already resolved for this request (only for non-explicit calls)
  if (!explicitSiteCode && event.context.site) {
    return event.context.site as SiteContext
  }

  // 1. Extract siteCode from hostname OR use explicit value OR query params OR cookie
  let siteCode = explicitSiteCode
  if (!siteCode) {
    const rawHost = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || ''
    const host = normalizeHost(rawHost)

    siteCode = extractSiteCodeFromHost(host)

    // Fallback: try to get siteCode from query params (for internal fetches from client)
    if (!siteCode) {
      const query = getQuery(event) as { siteCode?: string }
      siteCode = query.siteCode || null
    }

    // Fallback: try to get siteCode from context cookie (for internal server-to-server fetches)
    if (!siteCode) {
      siteCode = getCookieSiteCode(event)
    }

    if (!siteCode) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: `Could not derive siteCode from host: ${host || rawHost || 'unknown'}`
      })
    }
  }

  // 2. Get DMSM config (cached)
  const config = await getCachedDmsmConfig(siteCode)

  if (!config) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: `Site configuration not found for: ${siteCode}`
    })
  }

  // 3. Resolve locale (priority: explicit > query > path > cookie > DMSM default)
  let locale: string
  if (explicitLocale && explicitLocale !== 'und' && config.locales.includes(explicitLocale)) {
    locale = explicitLocale
  } else {
    // Also check query params for locale (internal fetches from client include it)
    const query = getQuery(event) as { locale?: string }
    const queryLocale = query.locale && config.locales.includes(query.locale) ? query.locale : null
    const pathLocale = extractLocaleFromPath(event.path, config.locales, runtimeLocales)
    const cookieLocale = getCookieLocale(event)
    locale = resolveLocale(queryLocale || pathLocale, cookieLocale, config.defaultLocale, config.locales)
  }

  // 4. Build full context
  const context = buildSiteContext({
    siteCode,
    locale,
    config,
    env,
    multiSiteCode,
    baseHost
  })

  // 5. Cache on event for this request (only for non-explicit calls)
  if (!explicitSiteCode) {
    event.context.site = context
  }

  return context
}

/**
 * Get DMSM config with caching
 */
async function getCachedDmsmConfig(siteCode: string): Promise<DmsmConfig | null> {
  const { env, multiSiteCode, dmsm } = useRuntimeConfig().public
  const cacheKey = `${DMSM_CACHE_BASE}:${env}:${multiSiteCode}:${siteCode}`
  const storage = useStorage('context')

  // Try cache first
  const cached = await storage.getItem<{ data: DmsmConfig; expires: number }>(cacheKey)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  // Fetch from DMSM
  try {
    const uri = `${dmsm}/config/${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}/${encodeURIComponent(siteCode)}`
    const data = await $fetch<DmsmConfig>(uri)

    // Cache the result
    await storage.setItem(cacheKey, {
      data,
      expires: Date.now() + (DMSM_CACHE_TTL * 1000)
    })

    return data
  } catch (e) {
    consola.error(`Failed to fetch DMSM config for ${siteCode}:`, e)
    return null
  }
}

/**
 * Extract siteCode from hostname (e.g., "be.localhost" -> "be")
 */
function extractSiteCodeFromHost(host: string): string | null {
  if (!host) return null

  // Ignore common non-multisite hosts.
  // These can happen for internal/self fetches or when an upstream proxy strips Host.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null
  if (host.startsWith('[')) return null // IPv6 literal like [::]

  const parts = host.split('.')
  return parts.length > 1 ? parts[0] : null
}

/**
 * Normalize host header values:
 * - take first value if comma-separated (x-forwarded-host)
 * - strip port (example.com:443)
 * - trim whitespace
 */
function normalizeHost(rawHost: string): string {
  if (!rawHost) return ''

  // x-forwarded-host can be a comma-separated list; first is the original host.
  const first = rawHost.split(',')[0]?.trim() || ''

  // Strip port if present (avoid breaking subdomain extraction)
  // Keep IPv6 literals untouched (they start with '[').
  if (first.startsWith('[')) return first

  return first.replace(/:\d+$/, '')
}

/**
 * Extract locale from URL path (e.g., "/es/page" -> "es")
 */
function extractLocaleFromPath(
  path: string,
  siteLocales: string[],
  runtimeLocales: Array<{ code: string }>
): string | null {
  if (!path) return null

  const pathParts = path.split('/')
  const potentialLocale = pathParts[1]

  if (!potentialLocale) return null

  // Check against site-specific locales first
  if (siteLocales?.includes(potentialLocale)) {
    return potentialLocale
  }

  // Fallback to runtime locales
  const validCodes = runtimeLocales?.map(l => l.code) || []
  return validCodes.includes(potentialLocale) ? potentialLocale : null
}

/**
 * Get siteCode from context cookie (for internal server-to-server fetches)
 */
function getCookieSiteCode(event: H3Event): string | null {
  try {
    const { context: cookieStr } = parseCookies(event)
    if (!cookieStr) return null

    const cookie = JSON.parse(decodeURIComponent(cookieStr)) as Partial<ContextCookie>
    return cookie.siteCode || null
  } catch {
    return null
  }
}

/**
 * Get locale from context cookie
 */
function getCookieLocale(event: H3Event): string | null {
  try {
    const { context: cookieStr } = parseCookies(event)
    if (!cookieStr) return null

    const cookie = JSON.parse(decodeURIComponent(cookieStr)) as Partial<ContextCookie>
    return cookie.locale || null
  } catch {
    return null
  }
}

/**
 * Resolve final locale with priority: path > cookie > default
 */
function resolveLocale(
  pathLocale: string | null,
  cookieLocale: string | null,
  defaultLocale: string,
  siteLocales: string[]
): string {
  // Path locale has highest priority
  if (pathLocale && siteLocales.includes(pathLocale)) {
    return pathLocale
  }

  // Cookie locale if valid for this site
  if (cookieLocale && siteLocales.includes(cookieLocale)) {
    return cookieLocale
  }

  // Fall back to DMSM default
  return defaultLocale
}

/**
 * Build full SiteContext from resolved values
 */
function buildSiteContext(params: {
  siteCode: string
  locale: string
  config: DmsmConfig
  env: string
  multiSiteCode: string
  baseHost: string
}): SiteContext {
  const { siteCode, locale, config, env, multiSiteCode, baseHost } = params

  const hasRedirect = env === 'production' && config.redirect
  const host = hasRedirect ? `https://${config.redirect}` : `https://${siteCode}.${baseHost}`
  const pathPrefix = `/${locale}`
  const localizedHost = `${host}${pathPrefix}`

  // Index locale for CBD index API (only UN languages)
  const indexLocale = ['en', 'ar', 'es', 'fr', 'ru', 'zh'].includes(locale)
    ? locale.toUpperCase()
    : 'EN'

  // Normalize countries array
  const countries = normalizeCountries(config.country, config.countries)

  // Detect BCH site
  const isBchSite = baseHost.includes('bch') || 
                    host.includes('biosafety') || 
                    host.includes('bsl')

  return {
    siteCode,
    identifier: siteCode,
    multiSiteCode,
    env,
    locale,
    defaultLocale: config.defaultLocale,
    locales: config.locales,
    indexLocale,
    host,
    localizedHost,
    baseHost,
    country: config.country,
    countries,
    redirect: config.redirect,
    isBchSite,
    config
  }
}

/**
 * Normalize countries from config
 */
function normalizeCountries(country?: string, countries?: string[]): string[] {
  const result: string[] = []

  if (country) result.push(country)
  if (countries?.length) result.push(...countries)

  return [...new Set(result)].filter(c => c && c !== 'undefined')
}

/**
 * Get country code from context (random if multiple)
 */
export function getCountryCode(ctx: { country?: string; countries?: string[] }): string {
  if (ctx.country) return ctx.country

  if (!ctx.countries?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'No country or countries provided by context'
    })
  }

  const index = Math.floor(Math.random() * ctx.countries.length)
  return ctx.countries[index]
}
