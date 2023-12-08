import   camelCaseKeys   from 'camelcase-keys';
import { stripHtml } from "string-strip-html"; 

export const useContentTypeList = async (ctx) => {
   // await useDrupalLogin(ctx.identifier)
    return  getList(ctx)//makeTypeMap(await getAllContentTypeMenus(ctx))
}

function mapData(ctx){


    return async (results)=>{

        const promises = [];

        for (const aDoc of results.data){
            promises.push(getThesaurusByKey(aDoc.field_tags || aDoc.fieldTags).then((p)=>{aDoc.tags =mapTagsByType(p) ;}));

        }

        await Promise.all(promises);

        for (const key in results.data) {
            const { title, tags, path, field_type_placement,field_attachments, field_start_date, changed, sticky, promote, id, body } = results.data[key];

            if(body?.value) body.summary = stripHtml(body?.value).result.substring(0, 200);

            const mediaImage = getMediaImage(ctx, field_attachments);

            results.data[key] = camelCaseKeys({ mediaImage, title, tags, path, field_type_placement, field_start_date, changed, sticky, promote, id, summary: body?.summary } )
        }

        return results
    }
}

function getMediaImage(ctx, fieldAttachments){
    if(!Array.isArray(fieldAttachments)) return undefined

    const image = (fieldAttachments?.find(({ type }) => type === 'media--image'))?.field_media_image;

    if(!image) return undefined;

    const { meta, uri, filename } = image;
    const { width, height, alt, title } = meta
    const { url:src } = uri;


    return { filename, width, height, alt, title, src: ctx.host+src } 
}

function mapTagsByType(tags){
    if(!tags) return  undefined;
    const map = { };

    for (const tag of tags) {
        const type = thesaurusSourceMap[tag.identifier];

        if(!map[type]) map[type] = [];

        map[type].push(tag);
    }

    return map
}
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