export default cachedEventHandler(async (event) => {
        try{
            const query            = parseQuery   (event);
            const ctx              = getContext (event);

            const { countries:c } = { ...ctx, ...query }

            const countries = c.filter(x => x)

            const countryQueryString = Array.isArray(countries) && countries.length? countries.filter(x=>x).map((s)=>`country=${s.toUpperCase()}`).join('&') : '';
            const uri  = `https://api.gbif.org/v1/occurrence/search?${countryQueryString}&limit=0&facet=publishingOrg&facetLimit=1000`;
            const uri2 = `https://api.gbif.org/v1/dataset?${countryQueryString}`;


            const data = await Promise.all([$fetch(uri, { mode: 'cors' }).then(mapOccurrence),$fetch(uri2, { mode: 'cors' }).then(mapDataSets)])

            return { ...data[0], ...data[1] }
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/gbif.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/gbif.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    
    },
    externalCache
)

function mapOccurrence({ count, facets }){

    return { occurrences: count, publishers: facets[0]?.counts?.length }
}
function mapDataSets({ count:datasets}){

    return { datasets }
}