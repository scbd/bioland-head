
import { createHash } from 'node:crypto';
import { camelCase } from 'change-case/keys';
import { appPathFromDrupalPath, drupalPathPrefix } from '#shared/utils/drupal-path-prefix';
import { hasDrupalSessionCookie } from '#shared/utils/document-cache-ttl';
import { boundedTtlMap } from '../bounded-ttl-map.js';

const localizationExceptionPaths =  [];

/**
 * Rate-limit repeated identical log lines: prints first occurrence per key per 60s window,
 * and on next print after window expires, reports the suppressed count.
 * Bounded map (max 500 keys, FIFO eviction on insert of a new key).
 */
function createRateLimiter() {
    const map = new Map();
    const maxKeys = 500;

    return function logOnce(key, level, ...args) {
        const now = Date.now();
        const entry = map.get(key);

        if (entry && now < entry.windowExpires) {
            entry.count++;
            return;
        }

        if (entry?.count) {
            const last = args.length - 1;

            if (typeof args[0] === 'object') args[0] = { ...args[0], suppressed: entry.count };
            else args[last] = `${args[last] ?? ''} (suppressed ${entry.count})`;
        }

        if (!entry && map.size >= maxKeys) map.delete(map.keys().next().value);

        map.set(key, { windowExpires: now + 60000, count: 0 });
        consola[level](...args);
    };
}

const logOnce = createRateLimiter();

// Marks an error already logged by an inner catch so an outer catch does not log it again.
const LOGGED = Symbol('drupal-page.logged');

// A memo-served uuid miss (BL-1122) is always expected, whatever its status: it is a
// repeat of an outcome Drupal already gave once, not a new failure to alarm on.
const isExpectedFailure = (e) => e?.statusCode === 404 ||
                                 e?.remembered ||
                                 (e?.statusCode === 503 && e?.statusMessage === 'Drupal login unavailable') ||
                                 (e?.statusCode === 504 && e?.statusMessage === TRANSLATE_PATH_TIMED_OUT);

/**
 * Log a failure once: expected outcomes as a single-line, rate-limited warn with no stack;
 * anything else as a full consola.error. Skips errors an inner catch already logged.
 */
function logFailure(label, { siteCode, path }, e) {
    if (e?.[LOGGED]) return;

    if (!isExpectedFailure(e)) return consola.error(label, e);

    const key = `${siteCode}:${e.statusCode}:${JSON.stringify(path)}`;

    logOnce(key, 'warn', { siteCode, path: JSON.stringify(path), statusCode: e.statusCode, statusMessage: e.statusMessage });
}

// Non-enumerable symbol: invisible to JSON serialization and to what callers read off the error.
const markLogged = (error) => Object.defineProperty(error, LOGGED, { value: true });

// A dangling reference (404) or an unpublished node (403) answers the same for ~5 minutes,
// but BL-1065 keeps failures out of the shared cache, so each render re-asked Drupal
// (BL-1122). Remember those two outcomes, keyed by the full by-UUID request URI (host,
// locale, entity type, bundle, uuid, and any sub-path such as /field_attachments; query
// excluded) in process only. Never 5xx or network errors, and never for a signed-in
// request: an editor may be entitled to the unpublished node.
const UUID_MISS_TTL_MS      = 5 * 60 * 1000;
const UUID_MISS_MAX_ENTRIES = 1000;
const uuidMisses            = boundedTtlMap(UUID_MISS_MAX_ENTRIES);

// A 403 is only remembered when Drupal itself answered it as a JSON:API error document —
// a proxy/WAF block or an IP ban on the head's egress answers with a plain 403 (no
// JSON:API body) and must not be memo-served for 5 minutes after the block lifts.
function isJsonApiErrorDocument(e) {
    if (Array.isArray(e?.data?.errors)) return true;

    const contentType = e?.response?.headers?.get?.('content-type') || '';
    return contentType.includes('application/vnd.api+json');
}

export async function fetchEntityByUuid(uri, options) {
    const key  = isAuthenticatedRequest(options?.headers) ? null : uri;
    const miss = key && uuidMisses.get(key);

    if (miss) {
        const err = createError(miss);
        err.remembered = true;
        throw err;
    }

    try {
        return await $fetch(uri, options);
    } catch (e) {
        if (key && (e?.statusCode === 404 || (e?.statusCode === 403 && isJsonApiErrorDocument(e))))
            uuidMisses.set(key, { statusCode: e.statusCode, statusMessage: e.statusMessage }, UUID_MISS_TTL_MS);
        throw e;
    }
}

export async function getPageData(ctx, event){
    try{

        const headers =  event.context.headers;

        ctx.isLocalizationException       = hasLocalizationException(ctx);

        const { uuid,  type, bundle, label, redirect  }     = await getPageIdentifiers(ctx, headers);

        // If we have a redirect (e.g., alias found in different locale), return it immediately
        // without trying to fetch page data
        if(redirect) {
            return { redirect };
        }

        const { localizedHost, locale }   = ctx;
        const   query                     = getSearchParams(ctx, type, bundle);
        const   uri                       = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

        const { data } = await fetchEntityByUuid(uri, $fetchBaseOptions({ query, headers }));

        data.label = label;

        try {
            await addPageAliases(ctx, data).then((aliases) => data.aliases = aliases);
        } catch (e) {
            // When the Drupal login breaker is open, mapAliasByLocale fails with a 503.
            // Fall back to a plain language map: { en: '/en/node/123', fr: '/fr/node/123', ... }
            if (e.statusCode === 503) {
                consola.warn(`getPageData: login unavailable, using plain language map`, {
                    siteCode:   ctx.siteCode,
                    statusCode: e.statusCode,
                    message:    e.statusMessage || e.message
                });

                const { type: aliasType, id: aliasId } = entityTypeAndId(data);

                data.aliases = {};
                if (aliasId) for (const code of (ctx.locales || [])) {
                    data.aliases[code] = `/${code}/${aliasType}/${aliasId}`;
                }
            } else {
                throw e;
            }
        }
        
        if(isSystemPageWithParent(data)) await getChildren(ctx, data);

        return  await mapData(event, ctx)(data);
    }catch(e){
        const { localizedHost } = ctx;

        logFailure('getPageData', ctx, e);

        throw createError({
            statusCode   : e.statusCode,
            statusMessage: e.statusMessage,
            message      : `Server.util.drupal-page.getPageData: failed to get page identifiers for site/path: ${localizedHost}${ctx.path}`,
            data         : e
        });
    }

}   

// The original check here (`!data?.parent[0].id !== 'virtual'`) compared a boolean to a
// string, so it was always true and threw whenever `parent` was empty. Front-end components
// (app/components/page/list/tabs.vue, filter.vue) have always relied on `children` being
// populated for system pages with a 'virtual' parent too (top-level pages fall back to
// `children.length` to decide whether to render tabs), so this preserves that existing
// behavior — fetch children for any system page that has a parent entry — while fixing the
// crash on an empty `parent` array.
export function isSystemPageWithParent(data){
    return data?.type === 'taxonomy_term--system_pages' && !!data?.parent?.length;
}

async function getChildren(ctx, data){
    const { localizedHost }       = ctx;
    const   query                 =`?jsonapi_include=1&include=parent&filter[a-label][condition][path]=parent.id&filter[a-label][condition][operator]=%3D&filter[a-label][condition][value]=${encodeURIComponent(data.id)}`;
    const   uri                   = `${localizedHost}/jsonapi/taxonomy_term/system_pages${query}`;

    const { data:children } = await $fetch(uri, $fetchBaseOptions());



    data.children=children

    return data
}

function hasLocalizationException({ path }){
    for (const exceptionPath of localizationExceptionPaths)
        if(path.includes(exceptionPath)) return true;

    return false
}
function entityTypeAndId(data){
    if(data.drupal_internal__nid) return { type: 'node',          id: data.drupal_internal__nid };
    if(data.drupal_internal__tid) return { type: 'taxonomy/term', id: data.drupal_internal__tid };

    return { type: 'media', id: data.drupal_internal__mid };
}
async function addPageAliases(ctx,data){
    const { type, id } = entityTypeAndId(data);

    return mapAliasByLocale(ctx, type, id)
}
export async function getPageDates(ctx){
    const { localizedHost }       = ctx;
    const { uuid, type, bundle }  = await getPageIdentifiers(ctx);

    const query    = getSearchParams(ctx, type, bundle, );
    const uri      = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    const { data } = await fetchEntityByUuid(uri, $fetchBaseOptions({ query }));

    const { changed, created, field_start_date } = data;

    return { changed, created, startDate: field_start_date }
}


export async function getPageThumb(ctx){
    // Resolve menu-thumb identifiers against the default-language host.
    // field_attachments is not translatable, and many menu hrefs are EN-only
    // aliases that won't resolve under the active localized host (e.g. /es/...).
    const sourceHost              = sourceLangHost(ctx);
    const defaultCtx              = { ...ctx, localizedHost: sourceHost };
    const { uuid, type, bundle }  = await getPageIdentifiers(defaultCtx);

    if (!uuid) return '/images/no-image.png';

    const query    = getSearchParams(defaultCtx, type, bundle, 'field_attachments');
    const uri      = `${sourceHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}/field_attachments`;

    const { data } = await fetchEntityByUuid(uri, $fetchBaseOptions({ query }));

    return getThumbFiles(data,  { ...ctx, localizedHost: sourceHost })
}
function getLocalizationFromPath(ctx, path){

    const pathParts = path.split('/');

    const isLocalizedPath = ctx?.locales?.includes(pathParts[1]);

    return isLocalizedPath?  pathParts[1] : 'en'
}

/**
 * Check if a path looks like an alias (not a numeric entity path like /node/123)
 * @param {string} path - The path to check
 * @returns {boolean} True if the path appears to be an alias
 */
function isAliasPath(path) {
    // Numeric entity paths: /node/123, /media/456, /taxonomy/term/789
    const numericPatterns = [
        /^\/node\/\d+$/,
        /^\/media\/\d+$/,
        /^\/taxonomy\/term\/\d+$/,
    ];
    return !numericPatterns.some(pattern => pattern.test(path));
}

// "No other locale owns this alias". Never written to the shared fs cache (one file per
// arbitrary path, and the fs driver ignores ttl); kept in a bounded in-process map instead.
const ALIAS_NOT_FOUND = false;

// ofetch drops its own timeout when a signal is passed, so one hung locale would hold the
// shared in-flight sweep open indefinitely.
const TRANSLATE_PATH_TIMEOUT_MS = 5000;
const TRANSLATE_PATH_TIMED_OUT  = 'Drupal translate-path timed out';
const ALIAS_MISS_MAX_ENTRIES    = 1000;

const aliasMisses = boundedTtlMap(ALIAS_MISS_MAX_ENTRIES);

/**
 * Ask one locale's router/translate-path for the alias. Never rejects: lookups still in
 * flight are abandoned once an earlier locale answers, so a rejection would go unhandled.
 *
 * @returns {Promise<{locale: string, entityPath: string}|false|{error: Error}>}
 */
async function translatePathInLocale(host, locale, aliasPath, signal) {
    const uri = `${host}/${drupalPathPrefix(locale)}/router/translate-path?path=${encodeURIComponent(aliasPath)}`;

    try {
        // silentError: a 404 here is the expected answer for most locales, not an error line.
        const data = await $fetch(uri, $fetchBaseOptions({ signal: AbortSignal.any([signal, AbortSignal.timeout(TRANSLATE_PATH_TIMEOUT_MS)]), silentError: true }));

        return data?.entity ? { locale, entityPath: data.entity.path || aliasPath } : ALIAS_NOT_FOUND;
    } catch (error) {
        return error?.statusCode === 404 ? ALIAS_NOT_FOUND : { error };
    }
}

/**
 * Search for an alias across all locales when it doesn't resolve in the requested locale.
 * This handles cases where content only has an alias in one language.
 *
 * Every other locale is asked at once, and the answers are read in configured locale
 * order so the winner (and therefore the cached redirect) does not depend on which
 * Drupal response lands first. Throws when no locale owns the alias and at least one
 * could not be asked, so an outage is never cached as a miss (BL-1066).
 *
 * @param {Object} ctx - The request context
 * @param {string} aliasPath - The alias path to search for (without locale prefix)
 * @returns {Promise<{locale: string, entityPath: string}|false>} Found locale and entity path, or ALIAS_NOT_FOUND
 */
async function _findAliasInOtherLocales(ctx, aliasPath) {
    const { host, locale: requestedLocale, locales } = ctx;
    const otherLocales = (locales || []).filter(l => l !== requestedLocale);

    if (!otherLocales.length) return ALIAS_NOT_FOUND;

    const controller = new AbortController();
    const lookups    = otherLocales.map(tryLocale => translatePathInLocale(host, tryLocale, aliasPath, controller.signal));

    try {
        let failure;

        for (const lookup of lookups) {
            const result = await lookup;

            if (result?.locale) {
                consola.info(`findAliasInOtherLocales: Alias ${JSON.stringify(aliasPath)} resolved in locale "${result.locale}"`);
                return result;
            }
            failure ??= result?.error;
        }

        if (failure) throw failure;

        consola.debug(`findAliasInOtherLocales: Alias ${JSON.stringify(aliasPath)} not found in any locale`);
        return ALIAS_NOT_FOUND;
    } finally {
        controller.abort();
    }
}

// The path is hashed: unstorage key normalization merges `/`, `\`, `:`, rewrites `,` and
// truncates at `?`, and `..` makes the fs driver throw. The site prefix stays readable so
// clearSiteCache still matches.
function aliasCacheKey(ctx, aliasPath) {
    const { multiSiteCode, siteCode, locale } = ctx;

    if (!multiSiteCode || !siteCode || !locale)
        throw new Error(`findAliasInOtherLocales cache key missing: multiSiteCode=${multiSiteCode}, siteCode=${siteCode}, locale=${locale}`);

    const pathHash = createHash('sha1').update(aliasPath).digest('hex').slice(0, 16);

    return `${multiSiteCode}:${siteCode}:${locale}:${pathHash}`;
}

/**
 * Cached cross-locale alias lookup. Nitro shares one in-flight resolution per key, so
 * concurrent requests for the same alias run a single sweep. Only hits are stored, for
 * CACHE_TTL.ALIAS_FALLBACK_HIT.
 */
const findAliasInOtherLocalesCached = defineCachedFunction(_findAliasInOtherLocales, {
    ...getBaseCacheOptions('context', 'find-alias-in-other-locales', false, CACHE_TTL.ALIAS_FALLBACK_HIT),
    getKey  : aliasCacheKey,
    validate: (entry) => rejectNullish(entry) && entry.value !== ALIAS_NOT_FOUND,
});

// Misses expire after CACHE_TTL.ALIAS_FALLBACK_MISS so a newly added alias is picked up
// without a cache clear.
function isRecentMiss(key) {
    return aliasMisses.get(key) !== undefined;
}

function recordMiss(key) {
    aliasMisses.set(key, true, CACHE_TTL.ALIAS_FALLBACK_MISS * 1000);
}

// A crawler rotates each alias through every locale (/km/x, /lo/x, ...): before this, only
// the cross-locale sweep (findAliasInOtherLocalesCached) was cached, so the requested-locale
// router/translate-path lookup still ran uncached on every one of those requests (BL-1116).
// This caches the redirect DECISION itself - keyed by aliasCacheKey, so it already varies
// by multiSiteCode/siteCode/requested-locale/path - bounded and evicted the same shape as
// aliasMisses above. Only the redirect case is cached; normal page resolution is unaffected.
const ALIAS_REDIRECT_MAX_ENTRIES = 1000;
const aliasRedirects = boundedTtlMap(ALIAS_REDIRECT_MAX_ENTRIES);

function getCachedAliasRedirect(key) {
    return aliasRedirects.get(key);
}

function recordAliasRedirect(key, redirect) {
    aliasRedirects.set(key, redirect, CACHE_TTL.ALIAS_REDIRECT * 1000);
}

// An authenticated request must always re-run the header-bearing primary translate-path
// lookup: a cached anonymous redirect could hide an unpublished requested-locale alias
// from an editor who is entitled to see it. Anonymous traffic keeps the fast cached path.
// A real session cookie NAME (SESS/SSESS + hash), not any header containing "SESS".
function isAuthenticatedRequest(headers) {
    return hasDrupalSessionCookie(headers?.Cookie || headers?.cookie);
}

// A Drupal 5xx or a timeout on the requested-locale lookup is not a 404, so it never sweeps
// other locales (BL-1143); without this, every repeat hit re-asked a failing Drupal. Kept
// in process for CACHE_TTL.ALIAS_UPSTREAM_ERROR, never in shared storage, anonymous only.
const ALIAS_UPSTREAM_ERROR_MAX_ENTRIES = 1000;
const aliasUpstreamErrors = boundedTtlMap(ALIAS_UPSTREAM_ERROR_MAX_ENTRIES);

const isTimeout = (e) => e?.name === 'TimeoutError' || e?.cause?.name === 'TimeoutError';
const isUpstreamError = (e) => e?.statusCode >= 500 || isTimeout(e);

// getPageThumb asks the EN host with ctx.locale unchanged; aliasCacheKey is keyed by locale,
// so only a lookup against the locale's own host may read or write the map. Thumbnail
// lookups on non-en pages are therefore never remembered, same as before BL-1143.
const isOwnLocaleHost = ({ host, locale, localizedHost }) => localizedHost === `${host}/${drupalPathPrefix(locale)}`;

function throwIfRecentUpstreamError(key) {
    if (!aliasUpstreamErrors.get(key)) return;

    const err = createError({
        statusCode   : 503,
        statusMessage: 'Service Unavailable',
        message      : 'router/translate-path recently failed upstream; not retrying yet',
    });
    err.remembered = true;
    throw err;
}

async function findAliasInOtherLocales(ctx, aliasPath) {
    const key = aliasCacheKey(ctx, aliasPath);

    if (isRecentMiss(key)) return null;

    const match = await findAliasInOtherLocalesCached(ctx, aliasPath);

    if (match === ALIAS_NOT_FOUND) recordMiss(key);
    return match || null;
}

async function getPageIdentifiers(ctx,  headers){
    try{
        const { localizedHost, path, host, locale, locales, siteCode } = ctx;

        if(!localizedHost || localizedHost?.includes('undefined')) 
            throw createError({ 
                statusCode   : 422, 
                statusMessage: 'Unprocessable Content',
                message      : `Server.util.drupal-page.getPageIdentifiers: localizedHost is is not derived`,
                data: ctx,
                fatal:  true
            });

        const cleanPath  = removeLocalizationFromPath(ctx, path);
        const uri        = `${localizedHost}/router/translate-path?path=${encodeURIComponent(cleanPath||'/')}`;

        const isAlias          = isAliasPath(cleanPath);
        const isAuthenticated  = isAuthenticatedRequest(headers);
        const aliasRedirectKey = isAlias && !isAuthenticated ? aliasCacheKey(ctx, cleanPath) : null;
        const cachedRedirect   = aliasRedirectKey ? getCachedAliasRedirect(aliasRedirectKey) : undefined;

        if (cachedRedirect) {
            return {
                uuid: null,
                id: null,
                type: null,
                bundle: null,
                pagePath: path,
                path,
                label: null,
                redirect: cachedRedirect
            };
        }

        const upstreamErrorKey = aliasRedirectKey && isOwnLocaleHost(ctx) ? aliasRedirectKey : null;

        if (upstreamErrorKey) throwIfRecentUpstreamError(upstreamErrorKey);

        let data;
        try {
            // silentError: true suppresses the auto-log for a 404 since it's expected when an
            // alias doesn't resolve in the requested locale; log a debug line instead.
            data = await $fetch(uri, $fetchBaseOptions({ headers, signal: AbortSignal.timeout(TRANSLATE_PATH_TIMEOUT_MS), silentError: true }));
        } catch (fetchError) {
            // A status-less network error (ECONNREFUSED) is deliberately neither swept nor
            // remembered: a refused connection is cheap and should recover on the next hit.
            if (upstreamErrorKey && isUpstreamError(fetchError))
                aliasUpstreamErrors.set(upstreamErrorKey, true, CACHE_TTL.ALIAS_UPSTREAM_ERROR * 1000);

            if (isTimeout(fetchError))
                throw createError({ statusCode: 504, statusMessage: TRANSLATE_PATH_TIMED_OUT, cause: fetchError });

            // Log 404s at debug level since they're expected for many aliases; rate-limit per path
            if (fetchError.statusCode === 404) {
                const debugKey = `${siteCode}:404:${JSON.stringify(cleanPath)}`;
                logOnce(debugKey, 'debug', `getPageIdentifiers: 404 for ${JSON.stringify(cleanPath)} in locale "${locale}"`);
            }

            // Only a 404 means "not this locale": sweep the others. Any other failure is
            // rethrown as-is, so a Drupal 500 no longer fans out to every locale (BL-1143).
            if (isAlias && fetchError.statusCode === 404) {
                // A failed sweep is not cached; answer with the original error as before.
                const aliasMatch = await findAliasInOtherLocales(ctx, cleanPath).catch((e) => {
                    consola.warn(`findAliasInOtherLocales: lookup for ${JSON.stringify(cleanPath)} failed`, e?.statusCode ?? e?.message);
                    return null;
                });

                if (aliasMatch) {
                    // Found the alias in another locale - redirect to that locale's version
                    const redirectPath = `/${aliasMatch.locale}${cleanPath}`;
                    consola.info(`Alias "${cleanPath}" found in locale "${aliasMatch.locale}", redirecting`);

                    if (aliasRedirectKey) recordAliasRedirect(aliasRedirectKey, redirectPath);

                    return {
                        uuid: null,
                        id: null,
                        type: null,
                        bundle: null,
                        pagePath: path,
                        path,
                        label: null,
                        redirect: redirectPath
                    };
                }
            }
            // Re-throw if we couldn't find a fallback
            throw fetchError;
        }

        const { uuid, id, type, bundle,  canonical } = data?.entity || {};
        const aUrl = new URL(canonical);
        // Canonical comes back under the Drupal prefix (/fil/x for tl); compare and redirect in app locale terms.
        const canonicalPathname = appPathFromDrupalPath(aUrl.pathname);
        
        // Extract locale from canonical path (e.g., '/en/some-alias' -> 'en')
        const canonicalPathParts = canonicalPathname.split('/');
        const canonicalLocale = locales?.includes(canonicalPathParts[1]) ? canonicalPathParts[1] : null;
        
        // Check if current path is just a locale (e.g., '/en')
        const pathParts = path.split('/').filter(Boolean);
        const isJustLocale = pathParts.length === 1 && locales?.includes(pathParts[0]);
        
        // Only redirect if:
        // 1. Not the home path
        // 2. Not just a locale prefix (like '/en')
        // 3. Canonical doesn't already match current path
        // 4. Canonical locale matches requested locale (don't redirect to different locale)
        const shouldRedirect = !data?.isHomePath && 
                               !isJustLocale &&
                               !canonical.endsWith(path) &&
                               !canonicalPathname.endsWith(path) &&
                               canonicalLocale === locale;
        
        const redirect = shouldRedirect ? canonicalPathname : '';

        const returnValues = { uuid, id, type, bundle, pagePath:path, path,  label:data.label };

        return redirect? { ...returnValues, redirect} : returnValues;
    }catch(e){
        const { host } = ctx;

        logFailure('getPageIdentifiers', ctx, e);

        throw markLogged(createError({
            statusCode   : e.statusCode,
            statusMessage: e.statusMessage,
            message      : `Server.util.drupal-page.getPageIdentifiers: failed to get page identifiers for site/path: ${host}${ctx.path}`,
            data: e,
            fatal:  true
        }));
    }
}

async function getThumbFiles(data,  {localizedHost, host }){
    const allRequests =[];

    const images = data.filter(({ type })=> 'media--image'        === type);
    const heros  = data.filter(({ type })=> 'media--hero'         === type);
    const videos = data.filter(({ type })=> 'media--remote-video' === type);

    for(const attachment of [...images, ...heros, ...videos]){
        const { type, thumbnail } = attachment;
        
        if(thumbnail?.id){
            const thumb = (await $fetch(`${localizedHost}/jsonapi/file/file/${encodeURIComponent(thumbnail.id)}`, $fetchBaseOptions({ query: {jsonapi_include: 1}, mode: 'cors' })) )?.data?.uri?.url

            if(thumb) return host+thumb
        }
    }
    return '/images/no-image.png';
}

function mapData(event,ctx){
    return async (document)=>{
        const [docType, docBundle] = (document?.type || 'node--content').split('--');
        await backfillAttachments(ctx, document, docType || 'node', docBundle || 'content');

        const promises = [];

        if(document?.field_attachments?.length)
        for (const media of document['field_attachments']){

            promises.push(getMediaAliasById(ctx, media.drupal_internal__mid).then((p)=>{ 
                if(media)
                    media.path = p;
            }))
            if(media.field_tags || media.fieldTags)
                promises.push(getThesaurusByKey(event, media?.field_tags?.value || media?.fieldTags?.value).catch(() => []).then(async (p)=>{ media.tags = await mapTagsByType(p) ;}));
        }

        if(document.field_tags?.value || document.fieldTags?.value)
            // Tags are decoration: a thesaurus outage must not fail the page, and must not be
            // cached as "no tags" either - getThesaurusByKey throws so nothing is stored.
            promises.push(getThesaurusByKey(event, document.field_tags?.value || document.fieldTags?.value).catch(() => []).then(async (p)=>{ document.tags = await mapTagsByType(p) ;}));

        await Promise.all(promises);

        for (const key in document) {
            if(Array.isArray(document[key]))
                document[key] = document[key].map((item)=> camelCase(item))
        }

        return camelCase(document)
    }
}

// function mapTagsByType(tags){
//     if(!tags) return  undefined;
//     const map = { };

//     for (const tag of tags) {
//         const isNt7 = !!tag?.type?.includes('nationalTarget7');
//         const type = isNt7? 'nt7' : thesaurusSourceMap[tag.identifier];
     

//         if(!map[type]) map[type] = [];

//         map[type].push(tag);
//     }

//     return map
// }

export function getSearchParams(ctx, type, bundle, prop){
    const search = {jsonapi_include: 1};

    if(type === 'taxonomy_term' && bundle === 'system_pages') search['include'] = 'field_attachments,field_attachments.field_media_image,field_search,parent';
    if(type === 'node' && bundle === 'forum')setNodeForumSearchParams(search);
    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
    // hero carries field_media_image too — without it a standalone media--hero
    // page returns an unresolved file reference (no uri.url) and renders blank.
    if(type === 'media' &&  ['image', 'document', 'hero'].includes(bundle))  setMediaImageSearchParams(search);
    if(type === 'media' &&  ['document'].includes(bundle))  setMediaDocumentSearchParams(search);
    if(prop === 'field_attachments') search['include'] = 'thumbnail';

    return search;
}
function setNodeForumSearchParams(search){
    search['include'] = 'taxonomy_forums';
}
function setContentSearchParams(search){
    search['include'] = 'field_attachments,field_type_placement,field_attachments.field_media_image,field_attachments.thumbnail,field_attachments.field_media_document';
}
function setMediaImageSearchParams(search){
    search['include'] = 'field_media_image';
}

function setMediaDocumentSearchParams(search){
    search['include'] = 'field_media_image,field_media_document';
    
}

// Backfills field_attachments (and nested media file refs) from the source-language
// translation. Translated media entities often have `field_media_image` /
// `field_media_document` left empty even though the field is not translatable;
// we re-fetch them against the un-prefixed host (default language) and patch in.
// No-op when the doc is the source translation.
export async function backfillAttachments(ctx, doc, type = 'node', bundle = 'content') {
    if (!doc || doc.default_langcode) return doc;
    if (!doc.id) return doc;

    // Only node / taxonomy_term entities carry a `field_attachments` relationship.
    // Media bundles (image, document, remote_video, hero) do not, so requesting
    // `/jsonapi/media/<bundle>/<id>/field_attachments` returns 405 — there is
    // nothing to backfill when the page itself is a standalone media entity.
    if (type === 'media') return doc;

    const sourceHost = sourceLangHost(ctx);

    // 1. If field_attachments array is missing/empty, pull it from the source translation.
    if (!Array.isArray(doc.field_attachments) || !doc.field_attachments.length) {
        const uri = `${sourceHost}/jsonapi/${type}/${bundle}/${doc.id}/field_attachments`;
        const query = { jsonapi_include: 1, include: 'field_media_image,thumbnail,field_media_document' };

        try {
            const { data } = await $fetch(uri, $fetchBaseOptions({ query }));
            if (Array.isArray(data) && data.length) doc.field_attachments = data;
        } catch { /* leave doc untouched */ }
    }

    // 2. For each attachment, if its file reference is empty, refetch the media
    //    entity from the default-language host and patch the missing fields.
    if (Array.isArray(doc.field_attachments) && doc.field_attachments.length) {
        await Promise.all(doc.field_attachments.map((att) => backfillMediaFiles(sourceHost, att)));
    }

    return doc;
}

function sourceLangHost(ctx) {
    // Drupal source-language for all bioland sites is `en`. Note this is NOT
    // the same as ctx.defaultLocale (the site's default UI locale, e.g. `es`
    // for Guatemala) — translations of media entities often leave file
    // references empty, so we must fetch from the EN translation explicitly.
    return `${ctx?.host}/en`;
}

async function backfillMediaFiles(sourceHost, media) {
    if (!media || !media.id || !media.type) return;

    const [, mediaBundle] = media.type.split('--');
    if (!mediaBundle) return;

    // `field_media_image` exists on image / document / hero; `field_media_document`
    // only on document. remote_video carries neither (oembed URL + thumbnail), so
    // including those fields against it returns 405 — skip it entirely.
    const hasImageField = ['image', 'document', 'hero'].includes(mediaBundle);
    const hasDocField   = mediaBundle === 'document';

    const needsImage = hasImageField && !media.field_media_image?.uri?.url;
    const needsDoc   = hasDocField   && !media.field_media_document?.uri?.url;

    if (!needsImage && !needsDoc) return;

    const include = ['field_media_image', 'thumbnail'];
    if (hasDocField) include.push('field_media_document');

    const uri     = `${sourceHost}/jsonapi/media/${mediaBundle}/${media.id}`;
    const query   = { jsonapi_include: 1, include: include.join(',') };

    try {
        const { data } = await $fetch(uri, $fetchBaseOptions({ query }));
        if (!data) return;
        if (needsImage && data.field_media_image?.uri?.url) media.field_media_image = data.field_media_image;
        if (needsDoc   && data.field_media_document?.uri?.url) media.field_media_document = data.field_media_document;
        if (!media.thumbnail?.uri?.url && data.thumbnail?.uri?.url) media.thumbnail = data.thumbnail;
    } catch { /* leave attachment untouched */ }
}

