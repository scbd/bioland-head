
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
        
        await addPageAliases(ctx,data).then((aliases)=> data.aliases=aliases)
        
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
async function addPageAliases(ctx,data){
    const isMedia = !!data.drupal_internal__mid 
    const isTax   = !!data.drupal_internal__tid
    const isNode  = !!data.drupal_internal__nid
    const type    = isNode? 'node' : isTax? 'taxonomy/term' : 'media';
    const id   = isNode? data.drupal_internal__nid : isTax? data.drupal_internal__tid : data.drupal_internal__mid;

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

/**
 * Search for an alias across all locales when it doesn't resolve in the requested locale.
 * This handles cases where content only has an alias in one language.
 * 
 * Tries the router/translate-path endpoint with each available locale until one succeeds.
 * 
 * @param {Object} ctx - The request context
 * @param {string} aliasPath - The alias path to search for (without locale prefix)
 * @returns {Promise<{locale: string, entityPath: string}|null>} Found locale and entity path, or null
 */
async function findAliasInOtherLocales(ctx, aliasPath) {
    const { host, locale: requestedLocale, locales } = ctx;
    
    if (!locales || locales.length === 0) return null;
    
    // Try each locale except the one that already failed
    const otherLocales = locales.filter(l => l !== requestedLocale);
    
    consola.debug(`findAliasInOtherLocales: Trying locales [${otherLocales.join(', ')}] for alias "${aliasPath}"`);
    
    for (const tryLocale of otherLocales) {
        try {
            const localizedHost = `${host}/${tryLocale}`;
            const uri = `${localizedHost}/router/translate-path?path=${encodeURIComponent(aliasPath)}`;
            
            const data = await $fetch(uri, $fetchBaseOptions());
            
            // If we got here without error, the path resolved in this locale
            if (data?.entity) {
                consola.info(`findAliasInOtherLocales: Alias "${aliasPath}" resolved in locale "${tryLocale}"`);
                return { locale: tryLocale, entityPath: data.entity.path || aliasPath };
            }
        } catch (e) {
            // This locale also didn't work, continue to next
            consola.debug(`findAliasInOtherLocales: Alias not found in locale "${tryLocale}"`);
        }
    }
    
    consola.debug(`findAliasInOtherLocales: Alias "${aliasPath}" not found in any locale`);
    return null;
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
                const aliasMatch = await findAliasInOtherLocales(ctx, cleanPath);
                
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
                promises.push(getThesaurusByKey(event, media?.field_tags?.value || media?.fieldTags?.value).then(async (p)=>{ media.tags = await mapTagsByType(p) ;}));
        }

        if(document.field_tags?.value || document.fieldTags?.value)
            promises.push(getThesaurusByKey(event, document.field_tags?.value || document.fieldTags?.value).then(async (p)=>{ document.tags = await mapTagsByType(p) ;}));

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

function getSearchParams(ctx, type, bundle, prop){
    const search = {jsonapi_include: 1};

    if(type === 'taxonomy_term' && bundle === 'system_pages') search['include'] = 'field_attachments,field_attachments.field_media_image,field_search,parent';
    if(type === 'node' && bundle === 'forum')setNodeForumSearchParams(search);
    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
    if(type === 'media' &&  ['image', 'document'].includes(bundle))  setMediaImageSearchParams(search);
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

    const needsImage = !media.field_media_image?.uri?.url;
    const needsDoc   = mediaBundle === 'document' && !media.field_media_document?.uri?.url;

    if (!needsImage && !needsDoc) return;

    const include = ['field_media_image', 'thumbnail', 'field_media_document'].join(',');
    const uri     = `${sourceHost}/jsonapi/media/${mediaBundle}/${media.id}`;
    const query   = { jsonapi_include: 1, include };

    try {
        const { data } = await $fetch(uri, $fetchBaseOptions({ query }));
        if (!data) return;
        if (needsImage && data.field_media_image?.uri?.url) media.field_media_image = data.field_media_image;
        if (needsDoc   && data.field_media_document?.uri?.url) media.field_media_document = data.field_media_document;
        if (!media.thumbnail?.uri?.url && data.thumbnail?.uri?.url) media.thumbnail = data.thumbnail;
    } catch { /* leave attachment untouched */ }
}

