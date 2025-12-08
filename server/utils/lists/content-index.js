
import { stripHtml } from "string-strip-html"; 
import { camelCase } from 'change-case/keys';

// export const useAllContentIndex = async (ctx) => {

//     return  getAllContent(ctx)//makeTypeMap(await getAllContentTypeMenus(ctx))
// }

export const useContentTypeIndex = async (ctx) => {

    return  getListIndex(ctx);
}

function mapData(ctx){


    return async (results)=>{

        const promises = [];

        for (const aDoc of results.data){
            const { value, value2 } = (aDoc?.field_tags ||  aDoc?.fieldTags) || {};
            const keys = ((value || '') + (value2 ? ','+value2 : '')).split(',').map(k=>k.trim()).filter(Boolean);
      
            if(keys)
                promises.push(getThesaurusByKey(keys).then((p)=>{aDoc.tags =mapTagsByType(p) ;}));
        }
        await Promise.all(promises);

        for (const key in results.data) {
            const { drupal_internal__nid:dnid, type, title, tags, path, field_type_placement,field_attachments, field_start_date, changed, sticky, promote, id, body, field_migrated, field_order, } = results.data[key];

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

            results.data[key] = camelCase({dnid, href, type, mediaImage, title, tags, path, fieldOrder, field_type_placement, field_start_date, changed, sticky, promote, id, summary: body?.summary, index, fieldMigrated }, {deep: true}  );

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

    if(promoted){
        sortQueryString += `&sort[promoted][path]=promote`
        sortQueryString += `&sort[promoted][direction]=${encodeURIComponent(direction)}`
    }
    
    if(!freeText || !noSticky){
        sortQueryString += `&sort[sticky][path]=sticky`
        sortQueryString += `&sort[sticky][direction]=${encodeURIComponent(direction)}`
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
