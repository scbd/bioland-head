
import { stripHtml } from 'string-strip-html'; 
import { camelCase } from 'change-case/keys';

const defaultTypes = ['image', 'document', 'remote_video'];

export const useAllMedia = async (ctx) => {



    return  getAllMedia(ctx)
}


export const useMediaTypeList = async (ctx) => {

    const { localizedHost, drupalInternalId, drupalInternalIds } = ctx;

    const isAllTypes    = !drupalInternalIds?.length && !drupalInternalId;
    const types         = isAllTypes ? defaultTypes : [...(drupalInternalIds || []), drupalInternalId].filter((x)=>x);


    return  getLists(ctx, types)
}

async function getAllMedia(ctx){

    const [images, documents, remoteVids ] = await Promise.all([
        getAllMediaPager(ctx, 'image'),
        getAllMediaPager(ctx, 'document'),
        getAllMediaPager(ctx, 'remote_video')
    ])
    const meta = { image: images.meta.count, document: documents.meta.count, remote_video: remoteVids.meta.count, count: images.meta.count + documents.meta.count + remoteVids.meta.count}
    const { data  } = (await mapData(ctx)([{ data: [...images.data, ...documents.data, ...remoteVids.data]}]))

    return { data: data.sort((a,b)=>sort(a,b,'changed')), meta }
}

async function getAllMediaPager (ctx, type, next){
    try {
        const { localizedHost } = ctx;
        const   method          = 'get';
        const   headers         = { 'Content-Type': 'application/json' };
        const   include         = `&include=field_media_image,thumbnail${type==='document'? ',field_media_document': ''}`;
        const   uri             = next || `${localizedHost}/jsonapi/media/${encodeURIComponent(type)}?jsonapi_include=1${include}`;
        const { links, data, meta }         = await $fetch(uri, $fetchBaseOptions({ method, headers }))

        if(nextUri(links)) return { data: [ ...data, ...await getAllMediaPager(ctx, type, nextUri(links)) ], meta: { ...meta, type } };

        return { data, meta: { ...meta, type }}
    }
    catch(e){
        console.error('- recursive', e)
    }
}
async function getLists(ctx, types = defaultTypes){
    const isMultiple = types.length > 1;

    return mapData(ctx)(await Promise.all(types.map((type)=>getList(ctx, type, isMultiple))))
}

async function getList(ctx, type, isMultiple = false ) {
    const { localizedHost } = ctx;

    const uri            = `${localizedHost}/jsonapi/media/${encodeURIComponent(type)}?jsonapi_include=1&include=field_media_image,thumbnail${type==='document'? ',field_media_document': ''}`;
    const method         = 'get';
    const headers        = { 'Content-Type': 'application/json' };

    const { data, meta } = await $fetch(uri+getQuestString(ctx), $fetchBaseOptions({ method, headers }));


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
            if(aDoc.field_tags || aDoc.fieldTags)
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

            results.data[key] = camelCase({field_media_image, thumbnail, type, mediaImage, name, tags, path, field_description, changed, id, summary: field_description?.summary }, {deep: true} )
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

    sortQueryString += `&sort[sort-created][path]=${encodeURIComponent(sortBy || 'changed')}`
    sortQueryString += `&sort[sort-created][direction]=${encodeURIComponent(direction)}`

    return sortQueryString;
}

function getFreeTextFilterParams({ freeText }){
    if(!freeText) return '';

    let sortQueryString = '&filter[or-group][group][conjunction]=OR';

    sortQueryString += `&filter[free-text-title][condition][path]=name`;
    sortQueryString += `&filter[free-text-title][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-title][condition][value]=${encodeURIComponent(freeText)}`;
    sortQueryString += `&filter[free-text-title][condition][memberOf]=or-group`;

    sortQueryString += `&filter[free-text-body][condition][path]=field_description.value`;
    sortQueryString += `&filter[free-text-body][condition][operator]=CONTAINS`;
    sortQueryString += `&filter[free-text-body][condition][value]=${encodeURIComponent(freeText)}`;
    sortQueryString += `&filter[free-text-body][condition][memberOf]=or-group`;

    return sortQueryString;
}


function sort(a,b, prop){
    if(a[prop] < b[prop]) return 1; 
    if(a[prop] > b[prop]) return -1;

    return 0;
}