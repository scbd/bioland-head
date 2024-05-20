
import { stripHtml } from "string-strip-html"; 
import * as changeKeys from 'change-case/keys';

export const useAllContent = async (ctx) => {

    return  getAllContent(ctx)//makeTypeMap(await getAllContentTypeMenus(ctx))
}

export const useContentTypeList = async (ctx) => {

    return  getList(ctx);
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
// console.log('dnid', dnid)
            const mediaImage = getMediaImage(ctx, field_attachments);
            const page       = ctx.page? Number(ctx.page) : 1;
            const perPage    = ctx.rowsPerPage? Number(ctx.rowsPerPage) : 10;
            const index      = page > 1? (page-1)*perPage + Number(key) : Number(key);
            const localePath = ctx.locale === ctx.defaultLocale? '' : `/${ctx.locale}`;
            const hasAlias   = path?.alias && path.langcode === ctx.locale;
            const href       = hasAlias? path?.alias : `${localePath}/node/${dnid}`;

            results.data[key] = changeKeys.camelCase({dnid, href, type, mediaImage, title, tags, path, field_type_placement, field_start_date, changed, sticky, promote, id, summary: body?.summary, index }, {deep: true}  );

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


// function getAllContent(ctx ) {

// }

async function getAllContentPager(ctx ) {
    try {
        const { localizedHost } = ctx;
        const   method          = 'get';
        const   headers         = { 'Content-Type': 'application/json' };
        const uri               = `${localizedHost}/jsonapi/node/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image`;
        const { links, data, meta }         = await $fetch(uri, { method, headers })

        if(nextUri(links)) return { data: [ ...data, ...await getAllContentPager(ctx, nextUri(links)) ], meta: { ...meta } };

        return { data, meta: { ...meta }}
    }
    catch(e){
        console.error('- recursive', e)
    }
};

async function getList(ctx ) {
    const { localizedHost } = ctx;
    const uri           = `${localizedHost}/jsonapi/node/content?jsonapi_include=1&include=field_type_placement,field_attachments.field_media_image`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

   
    const { data, meta } = await $fetch(uri+getQuestString(ctx), { method, headers });


    return  mapData(ctx)({ data, count: meta?.count })
};

function getQuestString(ctx){
    return getTypeFilterParams(ctx)+getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);

}

function getTypeFilterParams({ drupalInternalId, drupalInternalIds }){
    if((!drupalInternalIds || !drupalInternalIds?.length) && !drupalInternalId) return '';

    const filters =  Array.isArray(drupalInternalIds)? [...drupalInternalIds, drupalInternalId] : [drupalInternalId];

    let filterQueryString = '';


    filterQueryString += `&filter[taxonomy_term--tags][condition][path]=field_type_placement.drupal_internal__tid`
    filterQueryString += `&filter[taxonomy_term--tags][condition][operator]=IN`

    for(const filter of filters)
        filterQueryString += `&filter[taxonomy_term--tags][condition][value][]=${filter}`;


    return  filterQueryString;
}

function getSortParams({ sortBy, sortDirection }){

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';
    sortQueryString += `&sort[sticky][path]=sticky`
    sortQueryString += `&sort[sticky][direction]=${direction}`
    sortQueryString += `&sort[sort-start][path]=field_start_date`
    sortQueryString += `&sort[sort-start][direction]=${direction}`
    sortQueryString += `&sort[sort-created][path]=${sortBy || 'changed'}`
    sortQueryString += `&sort[sort-created][direction]=${direction}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=title`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=body.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}