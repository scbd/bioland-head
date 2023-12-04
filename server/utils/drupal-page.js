import   camelCaseKeys   from 'camelcase-keys';

export async function getPageData(ctx){
    const { baseHost }            = useRuntimeConfig().public;
    const { uuid,  type, bundle } = await getPageIdentifiers(ctx);

        const { identifier, pathPreFix } = ctx;
    const   query  = getSearchParams(type, bundle);
    const   uri    = `https://${identifier}${baseHost}${pathPreFix || ''}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;
    const { data } = await $fetch(uri, { query });

    //await getPageAttachments(data, ctx);
//field_media_image


    return  await mapData(ctx)(data)
}
export async function getPageDates(ctx){
    const { localizedHost }       = ctx;
    const { uuid, type, bundle }  = await getPageIdentifiers(ctx);

    const query    = getSearchParams(type, bundle);
    const uri      = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    const { data } = await $fetch(uri, { query });

    const { changed, created, field_start_date } = data;

    return { changed, created, startDate: field_start_date }
}


export async function getPageThumb(ctx){
    const { localizedHost }       = ctx;
    const { uuid, type, bundle }  = await getPageIdentifiers(ctx);

    const query    = getSearchParams(type, bundle, 'field_attachments');
    const uri      = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}/field_attachments`;

    const { data } = await $fetch(uri, { query });

    return getThumbFiles(data,  ctx)
}

async function getPageIdentifiers({ localizedHost, path }){



    const uri = `${localizedHost}/router/translate-path?path=${encodeURIComponent(cleanToPath(path))}`;

    const data = await $fetch(uri, { mode: 'cors' })
    const { uuid, id, type, bundle } = data?.entity || {};

    // if(error?.value) throw new Error(`Error occurred fetching page uuid for path ${pagePath}`);

    return { uuid, id, type, bundle, pagePath:path, path };
}

async function getThumbFiles(data,  {localizedHost, host }){
    const allRequests =[];

    const images = data.filter(({ type })=> 'media--image' === type);
    const heros = data.filter(({ type })=> 'media--hero' === type);
    const videos = data.filter(({ type })=> 'media--remote-video' === type);

    for(const attachment of [...images, ...heros, ...videos]){
        const { type, thumbnail } = attachment;
        
        if(thumbnail?.id){
            const thumb = (await $fetch(`${localizedHost}/jsonapi/file/file/${thumbnail.id}`, { query: {jsonapi_include: 1}, mode: 'cors' }) )?.data?.uri?.url

            if(thumb) return host+thumb
        }



    }


    return '/images/no-image.png';
}

function mapData(ctx){
    const pathAlias = usePathAlias(ctx)

    return async (document)=>{
        const docs = []
        const promises = [];
        if(document?.field_attachments?.length)
        for (const media of document['field_attachments']){

            promises.push(pathAlias.getByMediaId(media.drupal_internal__mid).then((p)=>{ 
                media.path = p;
            }))
            promises.push(getThesaurusByKey(media.field_tags || media.fieldTags).then((p)=>{ media.tags =mapTagsByType(p) ;}));
        }

        promises.push(getThesaurusByKey(document.field_tags || document.fieldTags).then((p)=>{ document.tags =mapTagsByType(p) ;}));

        await Promise.all(promises);

        for (const key in document) {
            if(Array.isArray(document[key]))
                document[key] = document[key].map((item)=> camelCaseKeys(item))
        }

        return camelCaseKeys(document)
    }
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

function getSearchParams(type, bundle, prop){
    const search = {jsonapi_include: 1};

    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
    if(type === 'media' && bundle === 'image')  setMediaImageSearchParams(search);
    if(prop === 'field_attachments') search['include'] = 'thumbnail';

    return search;
}

function setContentSearchParams(search){
    search['include'] = 'field_attachments,field_type_placement,field_attachments.field_media_image,field_attachments.thumbnail';
}
function setMediaImageSearchParams(search){
    search['include'] = 'field_media_image';
}


function cleanToPath(path){
    const pathParts = path.split('/');

    if(pathParts[1] === 'zh') pathParts[1] = 'zh-hans';

    if(pathParts[1] === 'search') return '/search';
    
    if(pathParts[2] === 'search') return `/${pathParts[1]}/${pathParts[2]}`;

    return pathParts.join('/');
}
