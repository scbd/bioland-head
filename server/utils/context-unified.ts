import { camelCase } from "change-case/keys";
/**
 * Unified Server Context Resolution
 *
 * This is the ONLY way to get site context on the server.
 * Context is resolved once per request and cached on event.context.site
 *
 * Locale priority: URL path > cookie > DMSM default
 */

import type { H3Event } from "h3";
import type { SiteContext, DmsmConfig, ContextCookie } from "~/shared/types";
import { getSiteSettings } from "./drupal/index.js";


interface RequestContextOptions { /** Explicit siteCode (skips host extraction) - used by context API route */ siteCode?: string; /** Explicit locale (skips path/cookie resolution) */ locale?: string; /** Bypass DMSM config cache - forces fresh fetch from DMSM API */ bypassCache?: boolean; }

/**
 * Get site context for the current request
 * Caches result on event.context.site to avoid re-resolution
 *
 * @param event - H3 event
 * @param options - Optional overrides for siteCode and locale (used by context API route)
 */
export async function useRequestContext( event: H3Event, options?: RequestContextOptions ): Promise<SiteContext> {
  const { baseHost, env, multiSiteCode, locales: runtimeLocales, } = useRuntimeConfig().public;

  // If explicit siteCode provided (from route params), use it directly
  // This is for the /api/context/[siteCode]/[locale] route where host may be localhost
  const explicitSiteCode = options?.siteCode;
  const explicitLocale = options?.locale;

  // Create cache key based on whether we have explicit params
  const cacheKey = explicitSiteCode ? `site-${explicitSiteCode}-${explicitLocale || "default"}` : "site"; 

  // Return cached context if already resolved for this request (only for non-explicit calls)
  if (!explicitSiteCode && event.context.site) {
    return event.context.site as SiteContext;
  }

  // 1. Extract siteCode from hostname OR use explicit value OR query params OR cookie
  let siteCode: string | null | undefined = explicitSiteCode;
  if (!siteCode) {
    const rawHost = getRequestHeader(event, "x-forwarded-host") || getRequestHeader(event, "host") || "";
    const firstRawHost = rawHost.split(",")[0]?.trim() || "";
    // h3 falls back on empty forwarded tokens and cannot read array headers.
    // Keep the raw reader's existing fallback/precedence for those inputs.
    const needsRawHost = !firstRawHost || Array.isArray(event.node.req.headers["x-forwarded-host"]) || Array.isArray(event.node.req.headers.host);
    const host = normalizeHost(needsRawHost ? rawHost : getRequestHost(event, { xForwardedHost: true }));

    // TRUST ASSUMPTION: `x-forwarded-host` is read ahead of `Host`, so tenancy is
    // only isolated where the edge (CDN/ALB/ingress) strips or overwrites any
    // client-supplied value. That edge control is an external rollout prerequisite
    // this handler cannot verify - see AADR 0002 and the multi-tenant isolation
    // rows in docs/architecture.md / docs/prd.md.
    // Only the exact raw internal spellings keep the query/cookie fallback. A
    // '::1:80' Host normalizes to '::1' by port stripping and must NOT
    // masquerade as the loopback - it reaches the reverse index like any other
    // custom host, and unmapped it fails closed before either fallback.
    if (isRawInternalHost(firstRawHost)) {
      siteCode = extractSiteCodeFromHost(host);
    } else if (isSuffixHostShape(host, baseHost)) {
      siteCode = extractSiteCodeFromHost(host);
      // A suffix shape must name a Site: a leading-empty-label host (".localhost",
      // ".<baseHost>") extracts an empty site code and fails closed here, never
      // through the query/cookie fallback.
      if (!siteCode) {
        throw hostFailedClosed(event, host, `No Site configured for host: ${host}`);
      }
    } else if (host) {
      siteCode = await resolveSiteCodeByHost(host);
      if (!siteCode) {
        throw hostFailedClosed(event, host, `No Site configured for host: ${host}`);
      }
    } else if (rawHost) {
      // The client sent Host bytes that normalize to nothing (empty forwarded
      // token, bare port, whitespace). Fail closed here rather than letting the
      // shape choose its own tenant through query/cookie; only a request with no
      // Host header at all keeps that internal fallback.
      throw hostFailedClosed(event, rawHost, "Unresolvable Host header");
    }

    // Fallback: try to get siteCode from query params (for internal fetches from client)
    if (!siteCode) {
      const query = getQuery(event) as { siteCode?: string };

      siteCode = query.siteCode || null;
    }

    // Fallback: try to get siteCode from context cookie (for internal server-to-server fetches)
    if (!siteCode) {
      siteCode = getCookieSiteCode(event);
    }

    if (!siteCode) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: `Could not derive siteCode from host: ${
          host || rawHost || "unknown"
        }`,
      });
    }
  }

  // 2. Get DMSM config (cached unless bypassed)
  const config = await getCachedDmsmConfig(event, siteCode, options?.bypassCache);

  if (!config) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: `Site configuration not found for: ${siteCode}`,
    });
  }

  // Normalize locales early - 'en' must always be available for all sites
  const siteLocales = normalizeLocales(config.locales, config.defaultLocale);

  // 3. Resolve locale (priority: explicit > query > path > cookie > DMSM default)
  let locale: string;
  if ( explicitLocale && explicitLocale !== "und" && siteLocales.includes(explicitLocale) ) {
    locale = explicitLocale;
  } else {
    // Also check query params for locale (internal fetches from client include it)
    const query        = getQuery(event) as { locale?: string };
    const queryLocale  = query.locale && siteLocales.includes(query.locale) ? query.locale : null;
    const pathLocale   = extractLocaleFromPath( event.path, siteLocales, runtimeLocales );
    const cookieLocale = getCookieLocale(event);

    locale = resolveLocale( queryLocale || pathLocale, cookieLocale, config.defaultLocale, siteLocales );
  }

  // 4. Build full context
  const context = await buildSiteContext({ siteCode, locale, config, env, multiSiteCode, baseHost, event, siteLocales, });

  // 5. Cache on event for this request (only for non-explicit calls)
  if (!explicitSiteCode)
    event.context.site = context;


  return context;
}

/**
 * In-flight request map for deduplication (prevents thundering herd)
 * Key: cache key, Value: pending promise
 */
const pendingDmsmRequests = new Map<string, Promise<DmsmConfig | null>>();

/**
 * Core DMSM fetch logic - shared by cached and direct fetch paths
 */
async function fetchDmsmConfigCore(siteCode: string): Promise<DmsmConfig | null> {
  const { env, multiSiteCode, dmsm } = useRuntimeConfig().public;

  try {
    const uri = `${dmsm}/config/${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}/${encodeURIComponent(siteCode)}`;
    const data = await $fetch<DmsmConfig>(uri);

    if (!data) {
      consola.error(`Site ${siteCode} not found in DMSM config for ${env}/${multiSiteCode}`);
      return null;
    }

    return data;
  } catch (e) {
    consola.error(`Failed to fetch DMSM config for ${siteCode}:`, e);
    return null;
  }
}

/**
 * Get DMSM config with caching and request coalescing
 * Uses cachedFunction for persistent cache + in-memory deduplication for concurrent requests
 */
const _fetchDmsmConfig = cachedFunction(
  async (_event: H3Event, siteCode: string): Promise<DmsmConfig | null> => {
    return fetchDmsmConfigCore(siteCode);
  },
  {
    maxAge: CACHE_TTL.FIVE_MINUTES, // 5 minutes cache
    name: "get-dmsm-config",
    group: "context",
    getKey: (_event: H3Event, siteCode: string) => {
      const { env, multiSiteCode } = useRuntimeConfig().public;
      return `${multiSiteCode}:${siteCode}`;
    }
  },
);

/**
 * Get DMSM config with request coalescing to prevent thundering herd
 * If a request is already in-flight for this siteCode, wait for it instead of starting a new one
 * @param bypassCache - If true, skips cache and fetches directly from DMSM API
 */
async function getCachedDmsmConfig(event: H3Event, siteCode: string, bypassCache?: boolean): Promise<DmsmConfig | null> {
  // Bypass cache if requested - fetch directly without caching or coalescing
  if (bypassCache) {
    consola.debug(`Bypassing DMSM cache for siteCode: ${siteCode}`);
    return fetchDmsmConfigCore(siteCode);
  }

  const { env, multiSiteCode } = useRuntimeConfig().public;
  const cacheKey = `${multiSiteCode}:${siteCode}`;

  // Check if there's already a request in-flight for this key
  const pending = pendingDmsmRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Start new request and track it
  const promise = _fetchDmsmConfig(event, siteCode)
    .finally(() => {
      // Clean up after completion (success or failure)
      pendingDmsmRequests.delete(cacheKey);
    });

  pendingDmsmRequests.set(cacheKey, promise);

  return promise;
}

/**
 * Extract siteCode from hostname (e.g., "be.localhost" -> "be")
 */
export function extractSiteCodeFromHost(host: string): string | null {
  if (!host) return null;

  // Ignore common non-multisite hosts.
  // These can happen for internal/self fetches or when an upstream proxy strips Host.
  if (host === "localhost" || host === "127.0.0.1" || host === "::1")
    return null;

  if (host.startsWith("[")) return null; // IPv6 literal like [::]

  const parts = host.split(".");

  return parts.length > 1 ? parts[0] : null;
}

/**
 * Normalize host header values:
 * - take first value if comma-separated (x-forwarded-host)
 * - strip port (example.com:443)
 * - trim whitespace
 */
function normalizeHost(rawHost: string): string {
  if (!rawHost) return "";

  // x-forwarded-host can be a comma-separated list; first is the original host.
  const first = rawHost.split(",")[0]?.trim() || "";

  // Strip port if present (avoid breaking subdomain extraction)
  // Keep IPv6 literals untouched (they start with '[').
  if (first.startsWith("[")) return first.toLowerCase();

  return first.replace(/:\d+$/, "").toLowerCase();
}

/**
 * Only the loopback (`[::1]`) and unspecified (`[::]`) IPv6 literals are internal
 * shapes. Any other bracketed literal is attacker-suppliable and must reach the
 * reverse index - and therefore the fail-closed 400 - like any other custom host.
 * The closing bracket must terminate the host, bar an optional `:port`. Matching
 * the bracketed prefix alone let `[::1]evil` ride the allowlist, and because
 * `extractSiteCodeFromHost` returns null for anything bracketed, that landed the
 * request on the query/cookie fallback to name its own tenant.
 */
function isLoopbackLiteral(host: string): boolean {
  if (!host.startsWith("[")) return false;
  const close = host.indexOf("]");
  const inner = close > 0 ? host.slice(1, close) : "";

  return (inner === "::1" || inner === "::") && /^(:\d+)?$/.test(host.slice(close + 1));
}

/**
 * Exact raw internal Host spellings that keep the historical query/cookie
 * fallback: `localhost` and `127.0.0.1` (each optionally port-suffixed), the
 * bare `::1` loopback, and the bracketed loopback literals (`[::1]`, `[::]`,
 * optional `:port` after the bracket). Checked against the RAW first Host
 * token, never the normalized one: an unbracketed `::1:80` port-strips to a
 * `::1` that must not masquerade as the loopback - that form fails this check
 * and reaches the reverse index, failing closed when unmapped.
 */
function isRawInternalHost(rawFirstHost: string): boolean {
  const raw = rawFirstHost.toLowerCase();
  return raw === "::1" || isLoopbackLiteral(raw) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw);
}

/**
 * Suffix-recognized host shapes (`.localhost` dev hosts and `.${baseHost}`
 * generated hosts). These must name a Site: the caller fails closed when
 * `extractSiteCodeFromHost` yields nothing for them (e.g. the leading-empty-
 * label `.localhost`, which extracts an empty string).
 */
function isSuffixHostShape(host: string, baseHost: string): boolean {
  return host.endsWith(".localhost") || Boolean(baseHost && host.endsWith(`.${baseHost.toLowerCase()}`));
}

/**
 * Build the fail-closed 400 for an inbound host, logging it first so a misrouted
 * origin or an index outage leaves a server-side signal. Host and pathname only -
 * never headers, cookies, or the query string (which is not needed to locate a
 * misrouted host and would log any credential a future caller puts in a param).
 */
function hostFailedClosed(event: H3Event, host: string, message: string) {
  consola.warn({ message: "Host failed closed", host, path: event.path.split("?")[0] });

  return createError({ statusCode: 400, statusMessage: "Bad Request", message });
}

/**
 * Extract locale from URL path (e.g., "/es/page" -> "es")
 */
function extractLocaleFromPath( path: string, siteLocales: string[], runtimeLocales: Array<{ code: string }> ): string | null {
  if (!path) return null;

  const pathParts = path.split("/");
  const potentialLocale = pathParts[1];

  if (!potentialLocale) return null;

  // Check against site-specific locales first
  if (siteLocales?.includes(potentialLocale)) {
    return potentialLocale;
  }

  // Fallback to runtime locales
  const validCodes = runtimeLocales?.map((l) => l.code) || [];

  return validCodes.includes(potentialLocale) ? potentialLocale : null;
}

/**
 * Get siteCode from context cookie (for internal server-to-server fetches)
 */
export function getCookieSiteCode(event: H3Event): string | null {
  try {
    const { context: cookieStr } = parseCookies(event);
    if (!cookieStr) return null;

    const cookie = JSON.parse( decodeURIComponent(cookieStr) ) as Partial<ContextCookie>;

    return cookie.siteCode || null;
  } catch {
    return null;
  }
}

/**
 * Get locale from context cookie
 */
function getCookieLocale(event: H3Event): string | null {
  try {
    const { context: cookieStr } = parseCookies(event);
    if (!cookieStr) return null;

    const cookie = JSON.parse( decodeURIComponent(cookieStr) ) as Partial<ContextCookie>;

    return cookie.locale || null;
  } catch {
    return null;
  }
}

/**
 * Resolve final locale with priority: path > cookie > default
 */
function resolveLocale( pathLocale: string | null, cookieLocale: string | null, defaultLocale: string, siteLocales: string[] ): string {
  // Path locale has highest priority
  if (pathLocale && siteLocales.includes(pathLocale))
    return pathLocale;


  // Cookie locale if valid for this site
  if (cookieLocale && siteLocales.includes(cookieLocale)) {
    return cookieLocale;
  }

  // Fall back to DMSM default
  return defaultLocale;
}

/** Sites already warned about, so a rejected redirect logs once per pod, not per request. */
const warnedRedirectRejections = new Set<string>();

/**
 * Warn once when an operator supplied a `redirect` the canonical-host validator refused.
 * Without this the only symptom is "the vanity domain never took effect", and because the
 * canonical gate is production-only that is discoverable in production alone. The value is
 * operator config rather than a secret, so it is echoed to make the typo obvious.
 * @param siteCode - Site the rejected value belongs to.
 * @param redirect - The raw DMSM `config.redirect` value, of unknown type.
 */
function warnOnRejectedRedirect(siteCode: string, redirect: unknown): void {
  if (!redirect || normalizeRedirectHost(redirect)) return;

  const shown = typeof redirect === "string" ? JSON.stringify(redirect) : `<non-string ${typeof redirect}>`;
  const key   = `${siteCode}:${shown}`;

  if (warnedRedirectRejections.has(key)) return;

  warnedRedirectRejections.add(key);
  consola.warn(`Ignoring unusable DMSM redirect for site ${siteCode}: ${shown}`);
}

/**
 * Build full SiteContext from resolved values
 */
async function buildSiteContext(params: { siteCode: string; locale: string; config: DmsmConfig; env: string; multiSiteCode: string; baseHost: string; event: H3Event; siteLocales: string[]; }): Promise<SiteContext> {
  const { siteCode, locale, config, env, multiSiteCode, baseHost, event, siteLocales } = params;

  warnOnRejectedRedirect(siteCode, config.redirect);

  const host = getCanonicalHost({ siteCode, baseHost, env, redirect: config.redirect });
  const pathPrefix    = `/${locale}`;
  const localizedHost = `${host}${pathPrefix}`;

  // Index locale for CBD index API (only UN languages)
  const indexLocale = ["en", "ar", "es", "fr", "ru", "zh"].includes(locale) ? locale.toUpperCase() : "EN";

  // Normalize countries array
  const countries = normalizeCountries(config.country, config.countries);

  // Detect BCH site
  const isBchSite = baseHost.includes("bch") || host.includes("biosafety") || host.includes("bsl");

  // Fetch site settings from Drupal (siteName + homePath in one call)
  let siteName: string | undefined;
  let homePath: string | undefined;
  try {
    const settings = await getSiteSettings({  siteCode,  locale,  config,  host,  localizedHost, env, multiSiteCode, }, event);

    siteName = settings.siteName;
    homePath = settings.homePath;
  } catch (e) {
    consola.error(`Failed to fetch site settings for ${siteCode} (${locale}):`, e);
    // Non-critical - continue without site settings
  }

  return {
    siteCode,
    identifier: siteCode,
    multiSiteCode,
    env,
    locale,
    defaultLocale: config.defaultLocale,
    locales: siteLocales,
    indexLocale,
    host,
    localizedHost,
    baseHost,
    country: config.country,
    countries,
    redirect: config.redirect,
    isBchSite,
    siteName,
    homePath,
    config,
    biolandSettings: config?.runTime?.biolandSettings? camelCase(config.runTime.biolandSettings, 7) || {} : {} ,
  };
  if(config?.runTime?.biolandSettings)config.runTime.biolandSettings = camelCase(config.runTime.biolandSettings, 7);
 
}

/**
 * Normalize locales to always include 'en'
 * English is required for all sites as the fallback language
 */
function normalizeLocales(locales: string[], defaultLocale: string): string[] {
  const result = new Set(locales || []);
  
  // Always include English as fallback
  result.add('en');
  
  // Ensure defaultLocale is included
  if (defaultLocale) result.add(defaultLocale);
  
  return [...result];
}

/**
 * Normalize countries from config
 */
function normalizeCountries(country?: string, countries?: string[]): string[] {
  const result: string[] = [];

  if (country) result.push(country);
  if (countries?.length) result.push(...countries);

  return [...new Set(result)].filter((c) => c && c !== "undefined");
}

/**
 * Get country code from context (random if multiple)
 */
export function getCountryCode(ctx: {
  country?: string;
  countries?: string[];
}): string {
  if (ctx.country) return ctx.country;

  if (!ctx.countries?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "No country or countries provided by context",
    });
  }

  const index = Math.floor(Math.random() * ctx.countries.length);
  return ctx.countries[index];
}
