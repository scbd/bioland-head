
import * as changeKeys from 'change-case/keys';

const localizationExceptionPaths = ['/forums/', '/forums', '/topics/'];

export async function getPageData(ctx){
    try{
 
        ctx.isLocalizationException   = hasLocalizationException(ctx);
        const { uuid,  type, bundle } = await getPageIdentifiers(ctx);
        const { localizedHost }       = ctx;
        const   query                 = getSearchParams(ctx, type, bundle);
        const   uri                   = `${localizedHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

        const { data } = await $fetch(uri, { query });

        await addPageAliases(ctx,data).then((aliases)=> data.aliases=aliases)
        
        consola.warn('====================', data.aliases)
        if(data.type === 'taxonomy_term--system_pages' && !data?.parent[0].id !== 'virtual' ) await getChildren(ctx, data);

        return  await mapData(ctx)(data)
    }catch(e){
        
        if(e.status === 404) throw createError({ statusCode: 404, statusMessage: `Failed to get page from path: ${ctx.path}`})
       
    }

}

async function getChildren(ctx, data){
    const { localizedHost }       = ctx;
    const   query                 =`?jsonapi_include=1&include=parent&filter[a-label][condition][path]=parent.id&filter[a-label][condition][operator]=%3D&filter[a-label][condition][value]=${data.id}`

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

async function getPageIdentifiers(ctx){

    const { locale, host,localizedHost, path, isLocalizationException  } = ctx;

    
    const pathLocal = getLocalizationFromPath(ctx, path)
    const isOnLocaleChange = pathLocal && (locale !== pathLocal);
    const cleanPath = removeLocalizationFromPath(ctx, path);
    const isDefaultLocale  = !!((locale === ctx.defaultLocale) || (isOnLocaleChange && (pathLocal ===ctx.defaultLocale)));
    console.log('=======================pathLocal', !pathLocal)
    console.log('=======================isDefaultLocale', isDefaultLocale)
    console.log('=======================isOnLocaleChange', isOnLocaleChange)
    console.log('=======================locale', locale)
    const uriHost = isLocalizationException || isDefaultLocale ? host : isOnLocaleChange? `${host}/${pathLocal}` :localizedHost;
console.log('=======================', cleanPath)
console.log('=======================', uriHost)
    const uri = `${uriHost}/router/translate-path?path=${encodeURIComponent(cleanPath||'/')}`;

console.log('=======================', uri)
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
                document[key] = document[key].map((item)=> changeKeys.camelCase(item))
        }

        return changeKeys.camelCase(document)
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

    if(type === 'taxonomy_term' && bundle === 'system_pages') search['include'] = 'field_attachments,field_attachments.field_media_image,field_search,parent,field_type_placement';
    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
    if(type === 'media' &&  ['image', 'document'].includes(bundle))  setMediaImageSearchParams(search);
    if(prop === 'field_attachments') search['include'] = 'thumbnail';
    
    return search;
}

function setContentSearchParams(search){
    search['include'] = 'field_attachments,field_type_placement,field_attachments.field_media_image,field_attachments.thumbnail,field_attachments.field_media_document';
}
function setMediaImageSearchParams(search){
    search['include'] = 'field_media_image';
}


// function cleanToPath(ctx, path){

//     const pathParts = path.split('/');

//     const isLocalizedPath = pathParts[1] === ctx.locale;

//     return isLocalizedPath?   [ '', ...pathParts.slice(2) ].join('/')    :  pathParts.join('/');
// }