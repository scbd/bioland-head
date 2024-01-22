import { stripHtml } from "string-strip-html"; 
export default cachedEventHandler(async (event) => {
    try{
        const query            = parseQuery   (event);
        const ctx              = getContext (event);

        const { locale, countries } = { ...ctx, ...query }

        const { panoramaKey }  = useRuntimeConfig();
        const panoLocales  = ['en', 'fr', 'es'];
        const panoLocale     = panoLocales.includes(locale)? locale.toLowerCase() : 'en';


        const countryQueryString = Array.isArray(countries) && countries.length? countries.map((s)=>`country=${s.toUpperCase()}`).join('&') : '';
        const uri = `https://api.gbif.org/v1/occurrence/search?${countryQueryString}&limit=0&facet=publishingOrg&facetLimit=1000`
        const uri2 = `https://api.gbif.org/v1/dataset?${countryQueryString}`;

        const data = await Promise.all([$fetch(uri, { mode: 'cors' }).then(mapOccurrence),$fetch(uri2, { mode: 'cors' }).then(mapDataSets)])

        return {...data[0], ...data[1]}
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/chm`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey
})

function mapOccurrence({ count, facets }){

    return { occurrences: count, publishers: facets[0]?.counts?.length }
}
function mapDataSets({ count:datasets}){

    return { datasets }
}