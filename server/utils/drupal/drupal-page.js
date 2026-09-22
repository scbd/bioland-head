
import { createHash } from 'node:crypto';
import { camelCase } from 'change-case/keys';

const localizationExceptionPaths =  [];

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

        const { data } = await $fetch(uri, $fetchBaseOptions({ query, headers }));

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
        
        if(data.type === 'taxonomy_term--system_pages' && !data?.parent[0].id !== 'virtual' ) await getChildren(ctx, data);

        return  await mapData(event, ctx)(data);
    }catch(e){
        const { localizedHost } = ctx;

        consola.error('getPageData',e);

        throw createError({ 
            statusCode   : e.statusCode, 
            statusMessage: e.statusMessage,
            message      : `Server.util.drupal-page.getPageData: failed to get page identifiers for site/path: ${localizedHost}${ctx.path}`,
            data         : e
        });
    }

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

    const { data } = await $fetch(uri, $fetchBaseOptions({ query }));

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

    const { data } = await $fetch(uri, $fetchBaseOptions({ query }));

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
const ALIAS_MISS_MAX_ENTRIES    = 1000;

const aliasMisses = new Map();

/**
 * Ask one locale's router/translate-path for the alias. Never rejects: lookups still in
 * flight are abandoned once an earlier locale answers, so a rejection would go unhandled.
 *
 * @returns {Promise<{locale: string, entityPath: string}|false|{error: Error}>}
 */
async function translatePathInLocale(host, locale, aliasPath, signal) {
    const uri = `${host}/${locale}/router/translate-path?path=${encodeURIComponent(aliasPath)}`;

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
    const expires = aliasMisses.get(key);

    if (expires === undefined) return false;
    if (Date.now() <= expires) return true;

    aliasMisses.delete(key);
    return false;
}

function recordMiss(key) {
    aliasMisses.delete(key);
    if (aliasMisses.size >= ALIAS_MISS_MAX_ENTRIES) aliasMisses.delete(aliasMisses.keys().next().value);
    aliasMisses.set(key, Date.now() + CACHE_TTL.ALIAS_FALLBACK_MISS * 1000);
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
        const { localizedHost, path, host, locale, locales } = ctx;

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

        let data;
        try {
            data = await $fetch(uri, $fetchBaseOptions({ headers}));
        } catch (fetchError) {
            // If router/translate-path fails and this looks like an alias path,
            // try to find it in other locales
            if (isAliasPath(cleanPath)) {
                // A failed sweep is not cached; answer with the original error as before.
                const aliasMatch = await findAliasInOtherLocales(ctx, cleanPath).catch((e) => {
                    consola.warn(`findAliasInOtherLocales: lookup for ${JSON.stringify(cleanPath)} failed`, e?.statusCode ?? e?.message);
                    return null;
                });

                if (aliasMatch) {
                    // Found the alias in another locale - redirect to that locale's version
                    const redirectPath = `/${aliasMatch.locale}${cleanPath}`;
                    consola.info(`Alias "${cleanPath}" found in locale "${aliasMatch.locale}", redirecting`);
                    
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
        const canonicalPathname = aUrl.pathname;
        
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
                               canonicalLocale === locale;
        
        const redirect = shouldRedirect ? canonicalPathname : '';

        const returnValues = { uuid, id, type, bundle, pagePath:path, path,  label:data.label };

        return redirect? { ...returnValues, redirect} : returnValues;
    }catch(e){
        const { host } = ctx;
        consola.error('getPageIdentifiers',e);

        throw createError({ 
            statusCode   : e.statusCode, 
            statusMessage: e.statusMessage,
            message      : `Server.util.drupal-page.getPageIdentifiers: failed to get page identifiers for site/path: ${host}${ctx.path}`,
            data: e,
            fatal:  true
        });
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

