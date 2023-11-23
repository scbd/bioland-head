import {  useSiteStore } from "~/stores/site";
import {  usePageStore } from "~/stores/page";

export const useHasHeroImage = async (path) => {
    const { field_attachments:fieldAttachments } = useState('pageData').value || usePageData(path);
    const hasPageHeroImage = ref(false);
    consola.warn('usePageData',fieldAttachments    );
    if(!fieldAttachments?.length) return hasPageHeroImage;


    hasPageHeroImage.value = !!fieldAttachments.find(({ type, name })=> type === 'media--image' && name.startsWith('hero-'));

    return hasPageHeroImage;
}

export async function usePageData(){
    try{
    const { localizedHost: host }  = useSiteStore();
    const { uuid,  type, bundle } = await getPageIdentifiers();

    const query = getSearchParams(type, bundle);
    const uri   = `${host}/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`;

    const { data } = await $fetch(uri, { query });

    await getPageAttachments(data)


    return data
    }catch(e){
        return {}
    }
}


async function getPageIdentifiers(){
    const { host } = useSiteStore();
    const { path } = usePageStore();

    const uri = `${host}/router/translate-path?path=${encodeURIComponent(cleanToPath(path))}`;

    const data = await $fetch(uri, {mode: 'cors'})
    const { uuid, id, type, bundle } = data?.entity || {};

    // if(error?.value) throw new Error(`Error occurred fetching page uuid for path ${pagePath}`);

    return { uuid, id, type, bundle, pagePath:path, path };
}


async function getPageAttachments(data){
    const allRequests =[];
    const { field_attachments, id } = data;
    const { localizedHost: uriStart }  = useSiteStore();


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

function getSearchParams(type, bundle){
    const search = {jsonapi_include: 1};

    if(type === 'node' && bundle === 'content')  setContentSearchParams(search);

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
