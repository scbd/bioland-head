

export const usePageData = () => {
    const pagePath       = useState('pagePath');

    if(!pagePath.value) throw new Error('State pagePath is not set');

    return getPageData(pagePath);
}

async function getPageData(requestedPath: Ref){
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;

    const { uuid, id, type, bundle } = await getPageIdentifiers(requestedPath);

    const uri = `https://${encodeURIComponent(siteIdentifier.value)}${baseHost}/ar/jsonapi/${encodeURIComponent(type)}/${encodeURIComponent(bundle)}/${encodeURIComponent(uuid)}`
    const { data, error } = await useFetch(uri, {mode: 'cors'})

    return data.value.data
}

async function getPageIdentifiers(requestedPath: Ref){
    
    const siteIdentifier = useState('siteIdentifier');
    const { baseHost }   = useRuntimeConfig().public;


    const { data, error } = await useFetch(`https://${siteIdentifier.value}${baseHost}/router/translate-path?path=${encodeURIComponent(requestedPath.value)}`, {mode: 'cors'})
    const { uuid, id, type, bundle } = data?.value?.entity || {};

    if(error?.value) throw new Error(`Error occurred fetching page uuid for path ${requestedPath}`);



    return { uuid, id, type, bundle, requestedPath };
}