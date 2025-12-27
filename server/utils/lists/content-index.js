
import { stripHtml } from "string-strip-html"; 
import { camelCase } from 'change-case/keys';

// export const useAllContentIndex = async (ctx) => {

//     return  getAllContent(ctx)//makeTypeMap(await getAllContentTypeMenus(ctx))
// }

export const useContentTypeIndex = async (ctx) => {

    return  getListIndex(ctx);
}

/**
 * Fetch field_tags for multiple nodes in a single bulk query
 * This replaces individual per-node fetches to avoid overwhelming Drupal
 *  This is needed because field_tags may not be translatable in Drupal,
 * so translated content doesn't include the tag data
 * 
 * @param {Object} ctx - Context with host and defaultLocale
 * @param {string[]} uuids - Array of Drupal node UUIDs
 * @returns {Promise<Map<string, Object>>} - Map of uuid -> field_tags
 */
const fetchBulkDefaultLocaleTags = defineCachedFunction(async (ctx, uuids) => {
    if (!uuids?.length) return {};
    
    const { host, defaultLocale } = ctx;
    const defaultLocalePath = defaultLocale ? `/${defaultLocale}` : '/en';
    
    // Build filter for multiple UUIDs using IN operator
    const uuidFilter = uuids.map(uuid => `filter[id][value][]=${encodeURIComponent(uuid)}`).join('&');
    const uri = `${host}${defaultLocalePath}/jsonapi/node/content?fields[node--content]=field_tags&filter[id][operator]=IN&${uuidFilter}`;
    
    try {
        const response = await $fetch(uri, $fetchBaseOptions({ method: 'get', headers: { 'Content-Type': 'application/json' } }));
        const tagsMap = new Map();
        
        if (response?.data) {
            for (const node of response.data) {
                const fieldTags = node?.field_tags || node?.fieldTags;
                if (fieldTags) {
                    tagsMap.set(node.id, fieldTags);
                }
            }
        }
        
        // Convert Map to plain object for caching (Map doesn't serialize well)
        return Object.fromEntries(tagsMap);
    } catch (e) {
        // Bulk fetch failed - return empty object, tags are optional
        consola.warn('fetchBulkDefaultLocaleTags failed:', e.message);
        return {};
    }
}, {
    maxAge: 60 * 60 * 12, // 12 hours cache
    getKey: (ctx, uuids) => `bulk-tags-${ctx.host}-${ctx.defaultLocale}-${uuids.sort().join(',')}`,
    base: 'tags',
    shouldBypassCache: (ctx) => shouldBypassCacheByQuery(ctx)
});

function mapData(ctx){


    return async (results)=>{

        const promises = [];
        
        // Collect UUIDs that need field_tags from default locale (for non-default locale requests)
        const uuidsNeedingTags = [];
        
        for (const aDoc of results.data){
            // Get field_tags from current doc - may be null for non-default locale translations
            // Drupal's field_tags is often not translatable, so we need to handle this
            let fieldTags = aDoc?.field_tags || aDoc?.fieldTags;
            
            // If no field_tags and we're in a non-default locale, collect UUID for bulk fetch
            if(!fieldTags && ctx.locale !== ctx.defaultLocale && aDoc?.id) {
                uuidsNeedingTags.push(aDoc.id);
            }
        }
        
        // Fetch all missing field_tags in a single bulk query (returns plain object for caching)
        const bulkTagsObj = uuidsNeedingTags.length > 0 
            ? await fetchBulkDefaultLocaleTags(ctx, uuidsNeedingTags)
            : {};

        // Now process all docs with tags (either from original doc or bulk fetch)
        for (const aDoc of results.data){
            let fieldTags = aDoc?.field_tags || aDoc?.fieldTags;
            
            // If we fetched from bulk, use that
            if (!fieldTags && bulkTagsObj[aDoc.id]) {
                fieldTags = bulkTagsObj[aDoc.id];
            }
            
            if (fieldTags) {
                const { value, value2 } = fieldTags;
                const keys = ((value || '') + (value2 ? ','+value2 : '')).split(',').map(k=>k.trim()).filter(Boolean);

                // Only fetch thesaurus data if we have keys
                if(keys.length)
                    promises.push(getThesaurusByKey(keys).then((p)=>{aDoc.tags = mapTagsByType(p) || {};}));
            }
        }
        await Promise.all(promises);

        for (const key in results.data) {
            const { drupal_internal__nid:dnid, type, title, tags, path, field_type_placement,field_attachments, field_start_date, field_published, changed, created, sticky, promote, id, body, field_migrated, field_order, } = results.data[key];

            if(body?.value) body.summary = body.summary || stripHtml(body?.value).result.substring(0, 400);

            const mediaImage = getMediaImage(ctx, field_attachments);
            const page       = ctx.page? Number(ctx.page) : 1;
            const perPage    = ctx.rowsPerPage? Number(ctx.rowsPerPage) : 10;
            const index      = page > 1? (page-1)*perPage + Number(key) : Number(key);
            const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;
            const hasAlias   = path?.alias && mapLocaleFromDrupal(path.langcode) === ctx.locale;
            const href       = hasAlias? path?.alias : `${localePath}/node/${dnid}`;
            const fieldOrder = (field_order !== null && field_order !== '' && field_order !== undefined) ? field_order : 10000;
            const fieldMigrated = hasFieldMigratedValue(field_migrated);

            results.data[key] = camelCase({dnid, href, type, mediaImage, title, tags, path, fieldOrder, field_type_placement, field_start_date, field_published, changed, created, sticky, promote, id, summary: body?.summary, index, fieldMigrated }, {deep: true}  );

            if(tags?.subjects)
                for (const subject of tags.subjects) 
                    if(subject?.title[ctx.locale])
                        subject.name=subject?.title[ctx.locale];
        }

        return results
    }
}

function getMediaImage(ctx, fieldAttachments){
    if(!Array.isArray(fieldAttachments)) return undefined

    const image = (fieldAttachments?.find(({ type }) => type === 'media--image'))?.field_media_image;

    if(!image) return undefined;

    if(!image.uri) return undefined

    const { meta, uri, filename } = image;
    const { width, height, alt, title } = meta
    const { url:src } = uri;


    return { filename, width, height, alt, title, src: ctx.host+src } 
}



async function getListIndex(ctx ) {
    const { localizedHost, locale, host, defaultLocale, page, rowsPerPage } = ctx;
    // Use localizedHost which includes the user's current locale (e.g., /es/)
    // Drupal content IS localized - titles, descriptions, and tags are stored per-language
    // We need to fetch content in the user's current locale to get translated content
    const uri           = `${localizedHost}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const fullUrl = uri+getQuestString(ctx);
    
    // Calculate the requested page size for slicing (getPaginationParams over-fetches)
    const requestedLimit = Number(rowsPerPage) || 10;
    const requestedPage = Number(page) || 1;
    
    // consola.debug('[content-index] Query URL:', fullUrl);
    // consola.debug('[content-index] Context:', { host, localizedHost, locale, defaultLocale, page, rowsPerPage, requestedLimit });

    const { data, meta } = await $fetch(fullUrl, $fetchBaseOptions({ method, headers }));

  //  consola.debug('[content-index] Results from Drupal:', { dataLength: data?.length, count: meta?.count });

    const { count, facets } = meta || {};

    // Map all fetched data first
    const mappedResults = await mapData(ctx)({ data, count });
    
    // Apply stable sort with ID as final tiebreaker to ensure deterministic ordering
    // This prevents SSR/hydration mismatches when Drupal returns items with same sort field values
    // in non-deterministic order across different requests.
    // We replicate Drupal's sort order (from getSortParams) and add ID as final tiebreaker:
    // 1. promoted (if ctx.promoted) 2. sticky (if no freeText or not noSticky)
    // 3. fieldOrder (ASC) 4. fieldPublished (DESC) 5. fieldStartDate (DESC) 6. changed (DESC) 7. created (DESC) 8. id (ASC)
    const { freeText, noSticky, promoted } = ctx;
    const shouldSortBySticky = !freeText || !noSticky;
    
    // if (mappedResults.data && mappedResults.data.length > 1) {
    //     mappedResults.data.sort((a, b) => {
    //         // promoted DESC (if requested)
    //         if (promoted) {
    //             const promoteA = a.promote ? 1 : 0;
    //             const promoteB = b.promote ? 1 : 0;
    //             if (promoteB !== promoteA) return promoteB - promoteA;
    //         }
            
    //         // sticky DESC (if no freeText or not noSticky)
    //         if (shouldSortBySticky) {
    //             const stickyA = a.sticky ? 1 : 0;
    //             const stickyB = b.sticky ? 1 : 0;
    //             if (stickyB !== stickyA) return stickyB - stickyA;
    //         }
            
    //         // fieldOrder ASC (lower numbers first, default 10000)
    //         const orderA = a.fieldOrder ?? 10000;
    //         const orderB = b.fieldOrder ?? 10000;
    //         if (orderA !== orderB) return orderA - orderB;
            
    //         // fieldPublished DESC (newer first)
    //         const publishedA = a.fieldPublished || '';
    //         const publishedB = b.fieldPublished || '';
    //         if (publishedA !== publishedB) return publishedB.localeCompare(publishedA);
            
    //         // fieldStartDate DESC (newer first)
    //         const startA = a.fieldStartDate || '';
    //         const startB = b.fieldStartDate || '';
    //         if (startA !== startB) return startB.localeCompare(startA);
            
    //         // changed DESC (newer first)
    //         const changedA = a.changed || '';
    //         const changedB = b.changed || '';
    //         if (changedA !== changedB) return changedB.localeCompare(changedA);
            
    //         // created DESC (newer first)
    //         const createdA = a.created || '';
    //         const createdB = b.created || '';
    //         if (createdA !== createdB) return createdB.localeCompare(createdA);
            
    //         // Final tiebreaker: id ASC (stable UUID)
    //         const idA = a.id || a.dnid || '';
    //         const idB = b.id || b.dnid || '';
    //         return String(idA).localeCompare(String(idB));
    //     });
    // }
    
    // Slice to requested page size since getPaginationParams over-fetches to compensate for access filtering
    // See: https://www.drupal.org/docs/core-modules-and-themes/core-modules/jsonapi-module/pagination
    if (mappedResults.data && mappedResults.data.length > requestedLimit) {
       // consola.debug('[content-index] Slicing results from', mappedResults.data.length, 'to', requestedLimit);
        mappedResults.data = mappedResults.data.slice(0, requestedLimit);
    }
    
    // Check if content_type facet is missing (Drupal may not return it for non-default locales)
    // If missing, fetch facets separately using default locale endpoint which reliably returns facets
    let enrichedFacets = facets || [];
    const hasContentTypeFacet = Array.isArray(facets) && facets.some(f => f.id === 'content_type');
    
    if (!hasContentTypeFacet && host && locale) {
        try {
            // Fetch content_type facet using default locale endpoint which reliably returns facets
            // but still filter by current locale so counts reflect the current language
            const defaultLocalePrefix = defaultLocale ? `/${defaultLocale}` : '/en';
            const defaultUri = `${host}${defaultLocalePrefix}/jsonapi/index/content?jsonapi_include=1`;
            // Use getQuestString which now includes the current locale's language filter
            const defaultFullUrl = defaultUri + getQuestString(ctx);
            const { meta: defaultMeta } = await $fetch(defaultFullUrl, $fetchBaseOptions({ method, headers }));
            
            if (defaultMeta?.facets) {
                // Find content_type facet from default locale response
                const contentTypeFacet = defaultMeta.facets.find(f => f.id === 'content_type');
                if (contentTypeFacet) {
                    enrichedFacets = [...(facets || []), contentTypeFacet];
                }
            }
        } catch (e) {
            // Silently fail - facets are optional
            console.warn('Failed to fetch content_type facets from default locale:', e.message);
        }
    }
    
    mappedResults.facets = enrichedFacets;

    return mappedResults;
};

function getQuestString(ctx){
  return (
    getLanguageFilterParams(ctx) +
    getFreeTextFilterParams(ctx) +
    getTypeFilterParams(ctx) +
    getDateFilterParams(ctx) +
    getSortParams(ctx)+getPaginationParams(ctx)
  ); //
}

function getLanguageFilterParams({ locale }){
    if(!locale) return '';

    const drupalLocale = mapLocaleToDrupal(locale);
    
    return `&filter[language]=${encodeURIComponent(drupalLocale)}`;
}

function getTypeFilterParams({ drupalInternalId, drupalInternalIds }){
    if((!drupalInternalIds || !drupalInternalIds?.length) && !drupalInternalId) return '';

    const filters =  Array.isArray(drupalInternalIds)? [...drupalInternalIds, drupalInternalId] : [drupalInternalId];

    let filterQueryString = '';

    filterQueryString += `&filter[tid][condition][path]=tid`
    filterQueryString += `&filter[tid][condition][operator]=IN`

    for(const filter of filters.filter(Boolean))
        filterQueryString += `&filter[tid][condition][value][]=${encodeURIComponent(filter)}`;


    return  filterQueryString;
}

function getSortParams({ sortBy, sortDirection, freeText, noSticky, promoted }){

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';

    if (!freeText || !noSticky) {
        sortQueryString += `&sort[sticky][path]=sticky`;
        sortQueryString += `&sort[sticky][direction]=${encodeURIComponent(
        direction
        )}`;
    }

    if(promoted){
        sortQueryString += `&sort[promoted][path]=promote`
        sortQueryString += `&sort[promoted][direction]=${encodeURIComponent(direction)}`
    }
    

    sortQueryString += `&sort[sort-order][path]=field_order`;
    sortQueryString += `&sort[sort-order][direction]=ASC`;
    sortQueryString += `&sort[sort-published][path]=field_published`
    sortQueryString += `&sort[sort-published][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-start][path]=field_start_date`
    sortQueryString += `&sort[sort-start][direction]=${encodeURIComponent(direction)}`
    sortQueryString += `&sort[sort-created][path]=${encodeURIComponent(sortBy || 'changed')}`
    sortQueryString += `&sort[sort-created][direction]=${encodeURIComponent(direction)}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString =`&filter[fulltext]=${encodeURIComponent(freeText)}`;


    return sortQueryString;
}

function getDateFilterParams({ from, to }){
    if(!from && !to) return '';

    let filterQueryString = '';

    if(from){
        filterQueryString += `&filter[date-from][condition][path]=field_start_date`;
        filterQueryString += `&filter[date-from][condition][operator]=>=`;
        filterQueryString += `&filter[date-from][condition][value]=${encodeURIComponent(from)}`;
    }

    if(to){
        filterQueryString += `&filter[date-to][condition][path]=field_start_date`;
        filterQueryString += `&filter[date-to][condition][operator]=<=`;
        filterQueryString += `&filter[date-to][condition][value]=${encodeURIComponent(to)}`;
    }

    return filterQueryString;
}

function hasFieldMigratedValue(fieldMigratedField){
    if(!fieldMigratedField) return false;

    const value = fieldMigratedField?.value ?? fieldMigratedField;

    if(typeof value === 'string') return value.trim().length > 0;
    if(Array.isArray(value)) return value.length > 0;
    if(typeof value === 'object') return Object.keys(value).length > 0;

    return Boolean(value);
}
