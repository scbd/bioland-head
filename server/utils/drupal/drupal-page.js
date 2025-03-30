
import { camelCase } from 'change-case/keys';

const localizationExceptionPaths =  [];

export async function getPageData(ctx, event){
    try{

        const headers =  event.context.headers;

        ctx.isLocalizationException       = hasLocalizationException(ctx);

        const { uuid,  type, bundle }     = await getPageIdentifiers(ctx, headers);


        const { localizedHost, locale }   = ctx;
        const   query                     = getSearchParams(ctx, type, bundle);
        const   uri                       = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

        const { data } = await $fetch(uri, { query, headers});

        await addPageAliases(ctx,data).then((aliases)=> data.aliases=aliases)
        
        if(data.type === 'taxonomy_term--system_pages' && !data?.parent[0].id !== 'virtual' ) await getChildren(ctx, data);

        return  await mapData(ctx)(data);
    }catch(e){
        const { localizedHost } = ctx;

        consola.error(e);

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

    const { data:children } = await $fetch(uri);



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
    const type = isNode? 'node' : isTax? 'taxonomy/term' : 'media';
    const id  = isNode? data.drupal_internal__nid : isTax? data.drupal_internal__tid : data.drupal_internal__mid;

    return mapAliasByLocale(ctx, type, id)
}
export async function getPageDates(ctx){
    const { localizedHost }       = ctx;
    const { uuid, type, bundle }  = await getPageIdentifiers(ctx);

    const query    = getSearchParams(ctx, type, bundle, );
    const uri      = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    const { data } = await $fetch(uri, { query });

    const { changed, created, field_start_date } = data;

    return { changed, created, startDate: field_start_date }
}


export async function getPageThumb(ctx){
    const { localizedHost }       = ctx;
    const { uuid, type, bundle }  = await getPageIdentifiers(ctx);

    const query    = getSearchParams(ctx, type, bundle, 'field_attachments');
    const uri      = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}/field_attachments`;

    const { data } = await $fetch(uri, { query });

    return getThumbFiles(data,  ctx)
}
function getLocalizationFromPath(ctx, path){

    const pathParts = path.split('/');

    const isLocalizedPath = ctx?.locales?.includes(pathParts[1]);

    return isLocalizedPath?  pathParts[1] : 'en'
}

async function getPageIdentifiers(ctx,  headers){
    try{
        const { localizedHost, path, host } = ctx;

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

        const data       = await $fetch(uri, { headers});

        const { uuid, id, type, bundle } = data?.entity || {};

        return { uuid, id, type, bundle, pagePath:path, path };
    }catch(e){
        const {, host } = ctx;
        consola.error(e);


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
            const thumb = (await $fetch(`${localizedHost}/jsonapi/file/file/${encodeURIComponent(thumbnail.id)}`, { query: {jsonapi_include: 1}, mode: 'cors' }) )?.data?.uri?.url

            if(thumb) return host+thumb
        }
    }
    return '/images/no-image.png';
}

function mapData(ctx){
    const pathAlias = usePathAlias(ctx);

    return async (document)=>{
        const promises = [];

        if(document?.field_attachments?.length)
        for (const media of document['field_attachments']){

            promises.push(pathAlias.getByMediaId(media.drupal_internal__mid).then((p)=>{ 
                if(media)
                    media.path = p;
            }))
            promises.push(getThesaurusByKey(media.field_tags || media.fieldTags).then((p)=>{ media.tags =mapTagsByType(p) ;}));
        }

        promises.push(getThesaurusByKey(document.field_tags || document.fieldTags).then((p)=>{ document.tags =mapTagsByType(p) ;}));

        await Promise.all(promises);

        for (const key in document) {
            if(Array.isArray(document[key]))
                document[key] = document[key].map((item)=> camelCase(item))
        }

        return camelCase(document)
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

function getSearchParams(ctx, type, bundle, prop){
    const search = {jsonapi_include: 1};

    if(type === 'taxonomy_term' && bundle === 'system_pages') search['include'] = 'field_attachments,field_attachments.field_media_image,field_search,parent';
    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
    if(type === 'media' &&  ['image', 'document'].includes(bundle))  setMediaImageSearchParams(search);
    if(type === 'media' &&  ['document'].includes(bundle))  setMediaDocumentSearchParams(search);
    if(prop === 'field_attachments') search['include'] = 'thumbnail';
    
    return search;
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

