
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

        for (const aDoc of results.data)
            promises.push(getThesaurusByKey(aDoc.field_tags || aDoc.fieldTags).then((p)=>{aDoc.tags =mapTagsByType(p) ;}));

        await Promise.all(promises);

        for (const key in results.data) {
            const { drupal_internal__nid:dnid, type, title, tags, path, field_type_placement,field_attachments, field_start_date, changed, sticky, promote, id, body } = results.data[key];

            if(body?.value) body.summary = stripHtml(body?.value).result.substring(0, 400);

            const mediaImage = getMediaImage(ctx, field_attachments);
            const page       = ctx.page && !isNaN(Number(ctx.page)) ? Number(ctx.page) : 1;
            const perPage    = ctx.rowsPerPage && !isNaN(Number(ctx.rowsPerPage)) ? Number(ctx.rowsPerPage) : 10;
            const index      = page > 1? (page-1)*perPage + Number(key) : Number(key);
            const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;
            const hasAlias   = path?.alias && mapLocaleFromDrupal(path.langcode) === ctx.locale;
            const href       = hasAlias? path?.alias : `${localePath}/node/${dnid}`;

            results.data[key] = camelCase({dnid, href, type, mediaImage, title, tags, path, field_type_placement, field_start_date, changed, sticky, promote, id, summary: body?.summary, index }, {deep: true}  );

            if(tags?.subjects)
                for (const subject of tags.subjects) 
                    if(subject?.title?.[ctx.locale])
                        subject.name=subject.title[ctx.locale];
        }

        return results;
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
    const { localizedHost, locale } = ctx;
    const uri           = `${localizedHost}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image&filter[language]=${mapLocaleToDrupal(locale)}`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    // consola.debug(uri)
    const { data, meta } = await $fetch(uri+getQueryString(ctx), $fetchBaseOptions({ method, headers }));


    return  mapData(ctx)({ data, count: meta?.count })
};

/**
 * Builds a query string from context parameters for the Drupal JSON:API.
 * Merges free text, type filter, pagination, and sort parameters into a single query string.
 * @param {Object} ctx - The context object containing query parameters.
 * @param {string} [ctx.freeText] - Free text search term.
 * @param {string} [ctx.drupalInternalId] - Single Drupal internal ID for filtering.
 * @param {string[]} [ctx.drupalInternalIds] - Array of Drupal internal IDs for filtering.
 * @param {number} [ctx.page=1] - Current page number.
 * @param {number} [ctx.rowsPerPage=10] - Number of rows per page.
 * @param {string} [ctx.sortBy] - Field to sort by.
 * @param {string} [ctx.sortDirection] - Sort direction ('ASC' or 'DESC').
 * @returns {string} The encoded query string prefixed with '&', or empty string if no params.
 */
function getQueryString(ctx){
    const params = {
        ...getFreeTextFilterParams(ctx),
        ...getTypeFilterParams(ctx),
        ...getPaginationParams(ctx),
        ...getSortParams(ctx)
    };

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params))
        searchParams.append(key, value);

    const queryString = searchParams.toString();

    return queryString ? `&${queryString}` : '';
}

/**
 * Generates filter parameters for filtering by Drupal taxonomy term IDs.
 * @param {Object} ctx - The context object.
 * @param {string} [ctx.drupalInternalId] - Single Drupal internal taxonomy term ID.
 * @param {string[]} [ctx.drupalInternalIds] - Array of Drupal internal taxonomy term IDs.
 * @returns {Object} Key-value pairs for the tid filter, or empty object if no IDs provided.
 */
function getTypeFilterParams({ drupalInternalId, drupalInternalIds }){
    if((!drupalInternalIds || !drupalInternalIds?.length) && !drupalInternalId) return {};

    const filters =  Array.isArray(drupalInternalIds)? [...drupalInternalIds, drupalInternalId] : [drupalInternalId];

    const params = {
        'filter[tid][condition][path]': 'tid',
        'filter[tid][condition][operator]': 'IN'
    };

    filters.filter(Boolean).forEach((filter, index) => {
        params[`filter[tid][condition][value][${index}]`] = filter;
    });

    return params;
}

/**
 * Generates sort parameters for ordering content results.
 * Sorts by sticky, published date, start date, and created/changed date.
 * @param {Object} ctx - The context object.
 * @param {string} [ctx.sortBy='changed'] - Field to sort by (defaults to 'changed').
 * @param {string} [ctx.sortDirection] - Sort direction; falsy for 'DESC', truthy for 'ASC'.
 * @param {string} [ctx.freeText] - If present with noSticky, skips sticky sorting.
 * @param {boolean} [ctx.noSticky] - If true with freeText, skips sticky sorting.
 * @returns {Object} Key-value pairs for sort parameters.
 */
function getSortParams({ sortBy, sortDirection, freeText, noSticky }){

    const direction = !sortDirection? 'DESC' : 'ASC';

    const params = {};

    if(!freeText || !noSticky){
        params['sort[sticky][path]'] = 'sticky';
        params['sort[sticky][direction]'] = direction;
    }

    // params['sort[promoted][path]'] = 'promote';
    // params['sort[promoted][direction]'] = direction;
    params['sort[sort-published][path]'] = 'field_published';
    params['sort[sort-published][direction]'] = direction;
    params['sort[sort-start][path]'] = 'field_start_date';
    params['sort[sort-start][direction]'] = direction;
    params['sort[sort-created][path]'] = sortBy || 'changed';
    params['sort[sort-created][direction]'] = direction;

    return params;
}

/**
 * Generates filter parameters for full-text search.
 * @param {Object} ctx - The context object.
 * @param {string} [ctx.freeText] - The free text search term.
 * @returns {Object} Key-value pair for fulltext filter, or empty object if no search term.
 */
function getFreeTextFilterParams({ freeText }){
    if(!freeText) return {};

    return { 'filter[fulltext]': freeText };
}

/**
 * Generates pagination parameters for limiting and offsetting results.
 * @param {Object} ctx - The context object.
 * @param {number} [ctx.page=1] - The current page number (1-indexed).
 * @param {number} [ctx.rowsPerPage=10] - Number of items per page.
 * @returns {Object} Key-value pairs for page limit and offset.
 */
function getPaginationParams({ page = 1, rowsPerPage = 10 }){
    const limit  = Number(rowsPerPage) ? Number(rowsPerPage) : 10;
    const offset = Number(page) > 1 ? (Number(page) - 1) * limit : 0;

    return {
        'page[limit]': limit,
        'page[offset]': offset
    };
}

