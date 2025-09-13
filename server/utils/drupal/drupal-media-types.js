import  paramCase  from 'limax';

export const useMediaTypeCounts = async (ctx) => {
    await useDrupalLogin(ctx.siteCode)
    const allCounts = await Promise.all([getAllMediaCounts(ctx)])

    return makeTypeMap(allCounts.flat())
}

export const useMediaTypeMenus = async (ctx) => {
    await useDrupalLogin(ctx.siteCode)
    return  makeTypeMap(await getAllMediaTypeMenus(ctx))
}

async function getMediaMenus (ctx, drupalInternalId) {
    const { localizedHost } = ctx;
    const include          = drupalInternalId === 'document'? 'thumbnail,field_media_image' : 'thumbnail';
    const uri               = `${localizedHost}/jsonapi/media/${encodeURIComponent(drupalInternalId)}?jsonapi_include=1&include=${encodeURIComponent(include)}&page[limit]=14&sort[sort-created][path]=created`;
    const method            = 'get';
    const headers           = { 'Content-Type': 'application/json' };

    const { data }          = await $fetch(uri, { method, headers });

    return mapData(ctx, drupalInternalId)(data)
};
function mapData(ctx, drupalInternalId){
    const pathAlias = usePathAlias(ctx)

    return async (data)=>{
        const docs = []
        const promises = [];
        for (const document of data){

            const { thumbnail, name, title, created, changed, drupal_internal__mid: drupalInternalMid  } = document;
            const thumbSource   = drupalInternalId === 'document'? document.field_media_image : thumbnail;
            const { url }       = thumbSource?.uri || {};
            const   href        = `/media/${encodeURIComponent(drupalInternalId)}/${encodeURIComponent(drupalInternalMid)}`;
            const   thumb       = url? `${ctx.host}${url || ''}` : '/images/no-image.png';
            
            const aDoc = { thumb, title:title || name, name, href, created, changed, drupalInternalMid }
            docs.push(aDoc);

            promises.push(pathAlias.getByMediaId(drupalInternalMid).then((p)=>{ 
                aDoc.path=p;
                if(p?.alias) aDoc.href=p?.alias;
            }))
            // .then((p)=>aDoc.path=p);

        }
        
        await Promise.all(promises);

        return docs;
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


async function getMediaTypes ({ siteCode, localizedHost }) {
    const uri   = `${localizedHost}/jsonapi/media_type/media_type?jsonapi_include=1`;

    const $http = await useDrupalLogin(siteCode)


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

    const uri           = `${localizedHost}/jsonapi/media/${encodeURIComponent(mediaType)}?jsonapi_include=1&page[limit]=1`;
    const method        = 'get';
    const headers       = { 'Content-Type': 'application/json' };

    const { meta } = await $fetch(uri, { method, headers });

    return meta
};