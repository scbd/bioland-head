
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
            const page       = ctx.page? Number(ctx.page) : 1;
            const perPage    = ctx.rowsPerPage? Number(ctx.rowsPerPage) : 10;
            const index      = page > 1? (page-1)*perPage + Number(key) : Number(key);
            const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;
            const hasAlias   = path?.alias && mapLocaleFromDrupal(path.langcode) === ctx.locale;
            const href       = hasAlias? path?.alias : `${localePath}/node/${dnid}`;

            results.data[key] = camelCase({dnid, href, type, mediaImage, title, tags, path, field_type_placement, field_start_date, changed, sticky, promote, id, summary: body?.summary, index }, {deep: true}  );

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
    const { localizedHost, locale } = ctx;
    const uri           = `${localizedHost}/jsonapi/index/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image&filter[language]=${mapLocaleToDrupal(locale)}`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    // consola.debug(uri)
    const { data, meta } = await $fetch(uri+getQuestString(ctx), $fetchBaseOptions({ method, headers }));


    return  mapData(ctx)({ data, count: meta?.count })
};

function getQuestString(ctx){

    return getFreeTextFilterParams(ctx)+ getTypeFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);
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

