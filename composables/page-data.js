

export const usePageData = (path) => {
    const pagePath       = path || useState('pagePath');


    if(!pagePath.value) throw new Error('State pagePath is not set');

    return getPageData(pagePath);
}

export const useHasHeroImage = async (path) => {
    const { field_attachments:fieldAttachments } = useState('pageData').value || usePageData(path);
    const hasPageHeroImage = ref(false);
    consola.warn('usePageData',fieldAttachments    );
    if(!fieldAttachments?.length) return hasPageHeroImage;


    hasPageHeroImage.value = !!fieldAttachments.find(({ type, name })=> type === 'media--image' && name.startsWith('hero-'));

    return hasPageHeroImage;
}

export async function getPageData({ uuid, id, type, bundle } ){
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;

    // const { uuid, id, type, bundle } = await usePageIdentifiers(requestedPath);

    const query = getSearchParams(type, bundle);

    const uri = `https://${encodeURIComponent(siteIdentifier.value)}${baseHost}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    return uri
    // const { data, error } = await useFetch(uri, { query });

    // //getPageAttachments(data.value.data)
    // consola.error(data.value.data);
    // return data.value.data
}

export async function usePageIdentifiers(requestedPath){
    
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;

    const uri = `https://${siteIdentifier.value}${baseHost}/router/translate-path?path=${encodeURIComponent(requestedPath.value)}`;

    const { data, error } = await useFetch(uri, {mode: 'cors'})
    const { uuid, id, type, bundle } = data?.value?.entity || {};

    if(error?.value) throw new Error(`Error occurred fetching page uuid for path ${requestedPath.value}`);

    return { uuid, id, type, bundle, requestedPath };
}


async function getPageAttachments(data){
    const { field_attachments, id } = data;
    const uriStart = getApiUriStart();

    if(!field_attachments || !field_attachments.length) return;

    for(const attachment of field_attachments){
        const { type, thumbnail, field_media_document, field_media_image, field_media_video, field_media_audio } = attachment;
        
        useFetch(`${uriStart}file/file/${thumbnail.id}`, { query: {jsonapi_include: 1}, mode: 'cors' })
            .then(({ data })=> attachment.thumbnail = { ...thumbnail, ...data.value.data })
//TODO - media field main fields

    }
    const { data: attachments } = await useFetch(field_attachments.links.related.href);

    return attachments;
}

function getSearchParams(type, bundle){
    consola.warn(type);
    const search = {jsonapi_include: 1};


    if(type === 'node' && bundle === 'content')  setContentSearchParams(search);

    return search;
}

function setContentSearchParams(search){
    search['include'] = 'field_attachments,field_type_placement';
}


function getApiUriStart(){
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;

    return `https://${encodeURIComponent(siteIdentifier.value)}${baseHost}/jsonapi/`;
}