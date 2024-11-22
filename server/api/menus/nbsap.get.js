
export default cachedEventHandler(async (event) => {
        try{
        
            const receivedQuery = parseQuery(event);
            const query         = getQueryString(receivedQuery)
            const response      = await $indexFetch(query)

            return response?.docs?.length? response.docs.map(mapDocs(receivedQuery.locale)).filter(filterDocs(receivedQuery.locale)) : {};
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/menus/nbsap.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/menus/nbsap.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
            }); 
        }
    },
    externalCache
)

function getQueryString({ countries, country, locale }={}){
    
    const fields = getIndexNrFields(locale);
    const q      = getIndexQuery('nationalReport', { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows;
}

function mapDocs(locale){ return (aDoc) => {
        const href  = aDoc.urls[0];
        const title = aDoc[`reportType`];

        return { title, href }
    }
}

function filterDocs(locale){ return (aDoc) => {

    return aDoc.title.includes('NBSAP');
}
}