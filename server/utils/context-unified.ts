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
import { sanitizeBiolandSettings } from "./bioland-settings";


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
    // The user-visible symptom. fetchDmsmConfigCore has already logged the cause;
    // this line ties it to the request that 404d so the two can be correlated.
    consola.error(`[dmsm] serving 404 - no config for ${siteCode}`, { siteCode, path: event?.path, host: event?.node?.req?.headers?.host, bypassCache: !!options?.bypassCache });

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
 * Thrown when DMSM has no config for a site, or could not be reached at all.
 *
 * It is thrown rather than returned so the miss never reaches the cache. A `null`
 * return value passes nitro's default `validate` and gets written to the `fs`-backed
 * cache store, and because `cachedFunction` is SWR by default that stale `null` keeps
 * being served past its maxAge - so a single failed fetch (DMSM cold, egress not up
 * yet on a restart) 404s every tenant until the entry is cleared by hand.
 */
class DmsmConfigUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DmsmConfigUnavailableError";
  }
}

/**
 * Flattens an unknown throwable into something that survives JSON log transport.
 *
 * `consola.error(msg, err)` loses the interesting fields once logs are shipped, and
 * the distinction we need here - DNS/connect refused vs a 4xx/5xx from DMSM vs an
 * empty 200 - lives in exactly those fields.
 */
function describeThrowable(e: unknown): Record<string, unknown> {
  const err = e as Record<string, any> | null | undefined;

  return {
    errName: err?.name,
    errMessage: err?.message,
    // ofetch surfaces HTTP failures here; undici/network failures leave them undefined.
    status: err?.status ?? err?.statusCode ?? err?.response?.status,
    statusText: err?.statusText ?? err?.response?.statusText,
    // ECONNREFUSED / ENOTFOUND / UND_ERR_CONNECT_TIMEOUT land on the code, often on the cause.
    code: err?.code ?? err?.cause?.code,
    causeName: err?.cause?.name,
    causeMessage: err?.cause?.message,
    responseBody: (typeof err?.data === "string" ? err.data : JSON.stringify(err?.data ?? null)).slice(0, 500),
  };
}

/**
 * Core DMSM fetch logic - shared by cached and direct fetch paths.
 * Resolves only with a real config; every miss throws.
 *
 * Every outcome is logged at INFO or above on purpose: production runs at
 * LOG_LEVEL.INFO, caching means this is at most one line per Site per maxAge, and
 * the whole deployment 404s when it goes wrong - so the cost of the noise is far
 * below the cost of not knowing which leg failed.
 */
async function fetchDmsmConfigCore(siteCode: string): Promise<DmsmConfig> {
  const { env, multiSiteCode, dmsm } = useRuntimeConfig().public;

  const uri = `${dmsm}/config/${encodeURIComponent(env)}/${encodeURIComponent(multiSiteCode)}/${encodeURIComponent(siteCode)}`;
  // A blank env/multiSiteCode/dmsm builds a plausible-looking but wrong URI
  // (".../config///be"), so name it before the request rather than after.
  const missingRuntimeConfig = (["dmsm", "env", "multiSiteCode"] as const).filter((k) => !({ dmsm, env, multiSiteCode })[k]);

  if (missingRuntimeConfig.length)
    consola.error(`[dmsm] runtime config is incomplete - the request URI cannot be correct`, { siteCode, missing: missingRuntimeConfig, dmsm, env, multiSiteCode, uri });

  const startedAt = Date.now();
  let data: DmsmConfig | null;

  try {
    data = await $fetch<DmsmConfig>(uri);
  } catch (e) {
    consola.error(`[dmsm] fetch threw for ${siteCode}`, { siteCode, uri, dmsm, env, multiSiteCode, ms: Date.now() - startedAt, ...describeThrowable(e) });
    throw new DmsmConfigUnavailableError(`Failed to fetch DMSM config for ${siteCode}`, { cause: e });
  }

  if (!data) {
    // A 204/empty body reaches here as a successful request with nothing in it -
    // a different failure from the throw above, and easy to confuse with it.
    consola.error(`[dmsm] fetch returned an empty body for ${siteCode}`, { siteCode, uri, dmsm, env, multiSiteCode, ms: Date.now() - startedAt, received: typeof data });
    throw new DmsmConfigUnavailableError(`Site ${siteCode} not found in DMSM config for ${env}/${multiSiteCode}`);
  }

  consola.info(`[dmsm] fetched config for ${siteCode}`, { siteCode, uri, ms: Date.now() - startedAt, locales: data.locales, defaultLocale: data.defaultLocale });

  return data;
}

/** How long a failed revalidation backs off before DMSM is probed again for that Site. */
const DMSM_REVALIDATION_BACKOFF_MS = CACHE_TTL.ONE_MINUTE * 1000;

/** Caps the backoff map: siteCode is attacker-influenced via the internal-Host fallback. */
const DMSM_REVALIDATION_BACKOFF_MAX_ENTRIES = 500;

/** Nitro storage coordinates of `_fetchDmsmConfig`, shared so the backoff can see its entries. */
const DMSM_CONFIG_CACHE = { name: "get-dmsm-config", group: "context" } as const;

const dmsmConfigCacheKey = (siteCode: string) => `${useRuntimeConfig().public.multiSiteCode}:${siteCode}`;

/**
 * Per-Site, in-process backoff after a failed revalidation, keyed exactly like
 * `_fetchDmsmConfig` (FIFO-bounded, expired entries dropped on read).
 */
const dmsmRevalidationBackoff = new Map<string, { untilTs: number; error: DmsmConfigUnavailableError }>();

/**
 * True when nitro holds a servable (stale) config for this key, i.e. the resolver is running
 * as an SWR revalidation. Mirrors nitro's cacheKey layout (default base "/cache").
 */
async function hasStaleDmsmConfig(key: string): Promise<boolean> {
  try {
    const entry = await useStorage().getItem<{ value?: unknown }>(`/cache:${DMSM_CONFIG_CACHE.group}:${DMSM_CONFIG_CACHE.name}:${key}.json`);
    return entry?.value !== undefined && entry?.value !== null;
  } catch {
    return false;
  }
}

/**
 * Wraps fetchDmsmConfigCore so a failed revalidation backs off for DMSM_REVALIDATION_BACKOFF_MS
 * before trying again, instead of being retried on every request.
 *
 * Nitro's SWR `cachedFunction` (see node_modules/nitropack/dist/runtime/internal/cache.mjs)
 * serves a stale entry immediately and kicks the resolver in the background whenever the
 * entry is past maxAge; `pending[key]` only coalesces requests that overlap an in-flight
 * resolution, so once one fails and clears `pending`, the very next request starts a brand
 * new resolution - that is the thundering herd from BL-1115. Short-circuiting the resolver
 * itself (rather than `shouldInvalidateCache`, which only controls when nitro decides to
 * call the resolver, not what it does once called) keeps the fix local to this one function
 * and touches nothing nitro writes to the shared cache: on backoff we rethrow the previous
 * failure without calling DMSM, so `validate` below still rejects it and BL-1065 still holds
 * (a failure is never stored as config). The backoff only applies while a stale entry exists:
 * with none, nitro awaits this resolver on the request path, so backing off would hide a
 * recovered DMSM from cold Sites - those keep retrying (`pending` coalesces concurrent ones).
 */
async function fetchDmsmConfigWithBackoff(siteCode: string): Promise<DmsmConfig> {
  const key = dmsmConfigCacheKey(siteCode);
  const backoff = dmsmRevalidationBackoff.get(key);

  if (backoff && Date.now() >= backoff.untilTs) dmsmRevalidationBackoff.delete(key);
  else if (backoff && await hasStaleDmsmConfig(key)) {
    consola.debug(`[dmsm] revalidation backed off for ${siteCode}`, { siteCode, remainingMs: backoff.untilTs - Date.now() });
    throw backoff.error;
  }

  try {
    const config = await fetchDmsmConfigCore(siteCode);
    dmsmRevalidationBackoff.delete(key);
    return config;
  } catch (e) {
    if (e instanceof DmsmConfigUnavailableError && await hasStaleDmsmConfig(key)) {
      dmsmRevalidationBackoff.delete(key);
      if (dmsmRevalidationBackoff.size >= DMSM_REVALIDATION_BACKOFF_MAX_ENTRIES) dmsmRevalidationBackoff.delete(dmsmRevalidationBackoff.keys().next().value!);
      dmsmRevalidationBackoff.set(key, { untilTs: Date.now() + DMSM_REVALIDATION_BACKOFF_MS, error: e });
    }
    throw e;
  }
}

/**
 * Get DMSM config with caching and request coalescing
 * Uses cachedFunction for persistent cache + in-memory deduplication for concurrent requests
 */
const _fetchDmsmConfig = cachedFunction(
  async (_event: H3Event, siteCode: string): Promise<DmsmConfig> => {
    return fetchDmsmConfigWithBackoff(siteCode);
  },
  {
    maxAge: CACHE_TTL.FIVE_MINUTES, // 5 minutes cache
    ...DMSM_CONFIG_CACHE,
    // Only a real config is cacheable. Rejecting nullish values also marks any
    // already-poisoned entry on disk as expired, so previously cached misses
    // re-fetch instead of being served stale forever under SWR.
    validate: (entry) => entry.value !== undefined && entry.value !== null,
    getKey: (_event: H3Event, siteCode: string) => dmsmConfigCacheKey(siteCode),
  },
);

/**
 * Get DMSM config with request coalescing to prevent thundering herd
 * If a request is already in-flight for this siteCode, wait for it instead of starting a new one
 * @param bypassCache - If true, skips cache and fetches directly from DMSM API
 */
export async function getCachedDmsmConfig(event: H3Event, siteCode: string, bypassCache?: boolean): Promise<DmsmConfig | null> {
  // Bypass cache if requested - fetch directly without caching or coalescing
  if (bypassCache) {
    consola.debug(`Bypassing DMSM cache for siteCode: ${siteCode}`);
    return fetchDmsmConfigCore(siteCode).catch(() => null);
  }

  const { env, multiSiteCode } = useRuntimeConfig().public;
  const cacheKey = `${multiSiteCode}:${siteCode}`;

  // Check if there's already a request in-flight for this key
  const pending = pendingDmsmRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Start new request and track it. fetchDmsmConfigCore has already logged the
  // reason, and callers treat a missing config as a 404, so collapse the
  // rejection back to null here and keep this function's contract total.
  const promise = _fetchDmsmConfig(event, siteCode)
    .catch(() => null)
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
 * Render a rejected redirect safely for logging: drops userinfo, tokens, and query/fragment.
 * An operator-supplied DMSM `config.redirect` might contain credentials or userinfo
 * (e.g. `user:password@example.com`), which must never be echoed into production logs.
 * @param redirect - The raw DMSM `config.redirect` value, of unknown type.
 * @returns A credential-safe string representation for logging.
 */
function sanitizeRejectedRedirect(redirect: unknown): string {
  if (typeof redirect !== "string") return `<non-string ${typeof redirect}>`;

  try {
    const parsed = new URL(redirect.includes("://") ? redirect : `https://${redirect}`);
    if (parsed.username || parsed.password) {
      return `<userinfo-redacted>@${parsed.hostname}`;
    }
    const safe = `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    return JSON.stringify(safe);
  } catch {
    if (redirect.includes("@")) {
      return "<userinfo-redacted>";
    }
    return JSON.stringify(redirect);
  }
}

/**
 * Warn once when an operator supplied a `redirect` the canonical-host validator refused.
 * Without this the only symptom is "the vanity domain never took effect", and because the
 * canonical gate is production-only that is discoverable in production alone. The value is
 * sanitized before logging so embedded credentials (e.g. userinfo) are never leaked to logs.
 * @param siteCode - Site the rejected value belongs to.
 * @param redirect - The raw DMSM `config.redirect` value, of unknown type.
 */
function warnOnRejectedRedirect(siteCode: string, redirect: unknown): void {
  if (!redirect || normalizeRedirectHost(redirect)) return;

  const shown = sanitizeRejectedRedirect(redirect);
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
    // Summary only: the error's message carries the api-key URL and its data a full HTML page.
    consola.error(`Failed to fetch site settings for ${siteCode} (${locale}):`, describeError(e));
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
    // BL-890: `bioland.settings` is editor-authored and passed through whole by dmsm, so it is
    // filtered HERE, at the boundary, not in each consumer. See ./bioland-settings.
    biolandSettings: camelCase(sanitizeBiolandSettings(config?.runTime?.biolandSettings), 7) || {},
  };
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
