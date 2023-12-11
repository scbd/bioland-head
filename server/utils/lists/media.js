import   camelCaseKeys   from 'camelcase-keys';
import { stripHtml } from "string-strip-html"; 


const defaultTypes = ['image', 'document', 'remote_video'];

export const useMediaTypeList = async (ctx) => {

    const { localizedHost, drupalInternalId, drupalInternalIds } = ctx;

    console.log('---------------------', drupalInternalIds)
    const isAllTypes    = !drupalInternalIds?.length && !drupalInternalId;
    const types         = isAllTypes ? defaultTypes : [...(drupalInternalIds || []), drupalInternalId].filter((x)=>x);


    return  getLists(ctx, types)
}

async function getLists(ctx, types = defaultTypes){
    return mapData(ctx)(await Promise.all(types.map((type)=>getList(ctx, type))))
}

async function getList(ctx, type ) {
    const { localizedHost } = ctx;

    const uri            = `${localizedHost}/jsonapi/media/${type}?jsonapi_include=1&include=field_media_image,thumbnail${type==='document'? ',field_media_document': ''}`;

    const method         = 'get';
    const headers        = { 'Content-Type': 'application/json' };

    const { data, meta } = await $fetch(uri+getQuestString(ctx), { method, headers });


    return { data, count: meta?.count }
};

function flattenData(ctx){
    return  (results)=>{
        if(results.length === 1) return results[0];

        const r = { data: [], count: 0 };
        for (const result of results) {
            r.data = [...r.data, ...result.data];
            r.count += result.count;
        }

        return r
    }

}
function mapData(ctx){
    const pathAlias = usePathAlias(ctx)

    return async (r)=>{
        const results = flattenData(ctx)(r)
        const promises = [];

        for (const aDoc of results.data){
            promises.push(getThesaurusByKey(aDoc.field_tags || aDoc.fieldTags).then((p)=>{aDoc.tags =mapTagsByType(p) ;}));
            promises.push(pathAlias.getByMediaId(aDoc.drupal_internal__mid).then((p)=>{ 
                aDoc.path = p;
            }))
        }

        await Promise.all(promises);

        for (const key in results.data) {
            const { type, name, tags, path, changed, id, field_description, field_media_image, thumbnail } = results.data[key];

            if(field_description?.value)field_description.summary = stripHtml(field_description?.value).result.substring(0, 400);

            const mediaImage =  getMediaImage(ctx, field_media_image.data? field_media_image : thumbnail);

            results.data[key] = camelCaseKeys({field_media_image, thumbnail, type, mediaImage, name, tags, path, field_description, changed, id, summary: field_description?.summary }, {deep: true} )
        }

        return results
    }
}

function getMediaImage(ctx, imageField){
    if(!imageField) return undefined

    const { meta, uri, filename } = imageField;
    const { width, height, alt, title } = meta || {};
    const { url:src } = uri || {};


    return { filename, width, height, alt, title, src: ctx.host+src } 
}
function getQuestString(ctx){
    return getFreeTextFilterParams(ctx)+getPaginationParams(ctx)+getSortParams(ctx);

}

function getSortParams({ sortBy, sortDirection }){

    const direction = !sortDirection? 'DESC' : 'ASC';

    let sortQueryString = '';

    sortQueryString += `&sort[sort-created][path]=${sortBy || 'changed'}`
    sortQueryString += `&sort[sort-created][direction]=${direction}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=name`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=field_description.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${freeText}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}