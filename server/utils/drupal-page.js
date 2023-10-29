

export async function getPageData({ identifier, pathPreFix, path }){
    const { baseHost }   = useRuntimeConfig().public;
    const { uuid,  type, bundle } = await getPageIdentifiers({ identifier, pathPreFix, path });

    const query = getSearchParams(type, bundle);
    const uri   = `https://${identifier}${baseHost}${pathPreFix}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    const { data } = await $fetch(uri, { query });

    await getPageAttachments(data,  {identifier, pathPreFix, path })


    return data
}

export async function getPageThumb({ identifier, pathPreFix, path }){
    const { baseHost }   = useRuntimeConfig().public;
    const { uuid,  type, bundle } = await getPageIdentifiers({ identifier, pathPreFix, path });

    const query = getSearchParams(type, bundle, 'field_attachments');
    const uri   = `https://${identifier}${baseHost}${pathPreFix}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}/field_attachments`;

    const { data } = await $fetch(uri, { query });

    //await getThumbFiles(data,  {identifier, pathPreFix, path })


    return getThumbFiles(data,  {identifier, pathPreFix, path })
}

async function getPageIdentifiers({ identifier, pathPreFix, path }){
    const { baseHost }   = useRuntimeConfig().public;


    const uri = `https://${identifier}${baseHost}${pathPreFix}/router/translate-path?path=${encodeURIComponent(cleanToPath(path))}`;

    const data = await $fetch(uri, { mode: 'cors' })
    const { uuid, id, type, bundle } = data?.entity || {};

    // if(error?.value) throw new Error(`Error occurred fetching page uuid for path ${pagePath}`);

    return { uuid, id, type, bundle, pagePath:path, path };
}

async function getThumbFiles(data,  {identifier, pathPreFix, path }){
    const allRequests =[];

    const { baseHost }   = useRuntimeConfig().public;

    const uriStart = `https://${identifier}${baseHost}${pathPreFix}`;

  

    const images = data.filter(({ type })=> 'media--image' === type);
    const heros = data.filter(({ type })=> 'media--hero' === type);
    const videos = data.filter(({ type })=> 'media--remote-video' === type);
    for(const attachment of [...images, ...heros, ...videos]){
        const { type, thumbnail } = attachment;
        
        if(thumbnail?.id){
            const thumb = (await $fetch(`${uriStart}/jsonapi/file/file/${thumbnail.id}`, { query: {jsonapi_include: 1}, mode: 'cors' }) )?.data?.uri?.url

            if(thumb) return thumb
        }



    }


    return '/64x64-00000000.png';
}

async function getPageAttachments(data,  {identifier, pathPreFix, path }){
    const allRequests =[];
    const { field_attachments, id } = data;
    const { baseHost }   = useRuntimeConfig().public;

    const uriStart = `https://${identifier}${baseHost}${pathPreFix}`;

    if(!field_attachments || !field_attachments.length) return;

    for(const attachment of field_attachments){
        const { thumbnail, field_media_document, field_media_image, field_media_image_1 } = attachment;
        
        if(thumbnail?.id)
            allRequests.push($fetch(`${uriStart}/jsonapi/file/file/${thumbnail.id}`, { query: {jsonapi_include: 1}, mode: 'cors' })
                .then(({ data })=> attachment.thumbnail = { ...thumbnail, ...data }))

        if(field_media_document?.id)
            allRequests.push($fetch(`${uriStart}/jsonapi/file/file/${field_media_document.id}`, { query: {jsonapi_include: 1}, mode: 'cors' })
                .then(({ data })=> attachment.field_media_document = { ...field_media_document, ...data }))

        if(field_media_image?.id)
            allRequests.push($fetch(`${uriStart}/jsonapi/file/file/${field_media_image.id}`, { query: {jsonapi_include: 1}, mode: 'cors' })
                .then(({ data })=> attachment.field_media_image = { ...field_media_image, ...data }))

        if(field_media_image_1?.id)
            allRequests.push($fetch(`${uriStart}/jsonapi/file/file/${field_media_image_1.id}`, { query: {jsonapi_include: 1}, mode: 'cors' })
                .then(({ data })=> attachment.field_media_image_1 = { ...field_media_image_1, ...data }))
        
    }
    await Promise.all(allRequests);

    return data;
}

function getSearchParams(type, bundle, prop){
    const search = {jsonapi_include: 1};

    if(type === 'node' && bundle === 'content' && !prop)  setContentSearchParams(search);
if(prop === 'field_attachments') search['include'] = 'thumbnail';
    return search;
}

function setContentSearchParams(search){
    search['include'] = 'field_attachments,field_type_placement';
}



function cleanToPath(path){
    const pathParts = path.split('/');

    if(pathParts[1] === 'zh') pathParts[1] = 'zh-hans';

    if(pathParts[1] === 'search') return '/search';
    
    if(pathParts[2] === 'search') return `/${pathParts[1]}/${pathParts[2]}`;

    return pathParts.join('/');
}
