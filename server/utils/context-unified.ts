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

/**
 * Get site context for the current request
 * Caches result on event.context.site to avoid re-resolution
 */
export async function useRequestContext(event: H3Event): Promise<SiteContext> {
  // Return cached context if already resolved for this request
  if (event.context.site) {
    return event.context.site as SiteContext
  }

  const { baseHost, env, multiSiteCode, locales: runtimeLocales } = useRuntimeConfig().public

  // 1. Extract siteCode from hostname
  const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host') || ''
  const siteCode = extractSiteCodeFromHost(host)

  if (!siteCode) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: `Could not derive siteCode from host: ${host}`
    })
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

  // 3. Resolve locale (priority: path > cookie > DMSM default)
  const pathLocale = extractLocaleFromPath(event.path, config.locales, runtimeLocales)
  const cookieLocale = getCookieLocale(event)
  const locale = resolveLocale(pathLocale, cookieLocale, config.defaultLocale, config.locales)

  // 4. Build full context
  const context = buildSiteContext({
    siteCode,
    locale,
    config,
    env,
    multiSiteCode,
    baseHost
  })

  // 5. Cache on event for this request
  event.context.site = context

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
  const parts = host.split('.')
  return parts.length > 1 ? parts[0] : null
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
