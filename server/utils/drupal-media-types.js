import { paramCase } from "param-case";

export const useMediaTypeCounts = async (ctx) => {
    await useDrupalLogin(ctx.identifier)
    const allCounts = await Promise.all([getAllMediaCounts(ctx)])

    return makeTypeMap(allCounts.flat())
}

export const useMediaTypeMenus = async (ctx) => {
    await useDrupalLogin(ctx.identifier)
    return  makeTypeMap(await getAllMediaTypeMenus(ctx))
}

async function getMediaMenus (ctx, drupalInternalId) {
    const { localizedHost } = ctx;
    const uri               = `${localizedHost}/jsonapi/media/${drupalInternalId}?jsonapi_include=1&include=thumbnail&page[limit]=7&sort[sort-created][path]=created`;
    const method            = 'get';
    const headers           = { 'Content-Type': 'application/json' };
    const { data }          = await $fetch(uri, { method, headers });

    return data.map(mapThumbNails(ctx))
};
function mapThumbNails(ctx){
    return (document)=>{

        document.thumb  = '/images/no-image.png';

        const { path, thumbnail, name, title, created, changed, drupal_internal__mid: drupalInternalMid  } = document;
        const { url }       = thumbnail?.uri || {};
        const   href        = path?.alias || `/media/${drupalInternalMid}`;
        const   thumb       = `${ctx.host}${url || ''}`;
        
        return { thumb, title:title || name, name, href, created, changed, drupalInternalMid };
    }
}

function makeTypeMap(data){
    const map = {};

    for(const item of data)
        map[item.slug] = item
    
    return map;
}


async function getAllMediaTypeMenus(ctx){
    const terms    = await  getMediaTypes(ctx);


    const requests = [];

    for(const term of terms){
        const aRequest = getMediaMenus(ctx, term.drupalInternalId).then(( data )=> ({ ...term, data }))

        requests.push(aRequest)
    }

    return Promise.all(requests);
}


async function getMediaTypes ({ identifier, localizedHost }) {
    const uri   = `${localizedHost}/jsonapi/media_type/media_type?jsonapi_include=1`;

    const $http = await useDrupalLogin(identifier)


    const { body }  = await $http.get(uri).withCredentials().accept('json')


    return body.data
                .map(({ drupal_internal__id:drupalInternalId, label:name })=> ({ drupalInternalId, name, slug: paramCase(name) }))
};


async function getAllMediaCounts (ctx) {
    const mediaTypes    = await getMediaTypes(ctx);


    const requests = [];
    
    for(const term of mediaTypes){

        if(!term?.drupalInternalId) throw new Error(`getAllMediaCounts -> ${term.name} does not have a drupalInternalId`);
        const aRequest = getMediaCounts(ctx, term.drupalInternalId).then(( { count } )=> ({ ...term, count }))

        requests.push(aRequest)
    }

    return Promise.all(requests);
};


async function getMediaCounts ({ localizedHost }, mediaType) {

    const uri           = `${localizedHost}/jsonapi/media/${mediaType}?jsonapi_include=1&page[limit]=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { meta } = await $fetch(uri, { method, headers });

    return meta
};