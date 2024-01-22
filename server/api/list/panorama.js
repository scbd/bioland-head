import { stripHtml } from "string-strip-html"; 
export default cachedEventHandler(async (event) => {
    try{
        const query            = parseQuery   (event);
        const ctx              = getContext (event);

        const { locale, countries } = { ...ctx, ...query }

        const { panoramaKey }  = useRuntimeConfig();
        const panoLocales  = ['en', 'fr', 'es'];
        const panoLocale     = panoLocales.includes(locale)? locale.toLowerCase() : 'en';


        const countryQueryString = Array.isArray(countries) && countries.length? countries.map((s)=>`country_iso_2[]=${s.toUpperCase()}`).join('&') : '';
        const uri = `https://panorama.solutions/${panoLocale}/api/v1/solutions?api_key=${panoramaKey}${countryQueryString? `&${countryQueryString}` : ''}`
        // `https://api.cbd.int/api/v2013/index/select?${queryFields}&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:bbiRequest)&rows=25&sort=createdDate_dt+desc&start=0&wt=json`

       const data = (await $fetch(uri, { mode: 'cors' }).then(({ solutions }) => solutions)).map(({ solution }) => solution).map(mapPanoData);
        //.then(({ response }) => response.docs.map(normalizeIndexKeys).map(mapHref));
        return data.slice(0, 5)
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

function mapPanoData({ id, url:href, title, summary, preview_image: mediaImage, classifications }){
    const { theme } = classifications
    const subjects  = (theme.length? theme.map((name)=> ({ name })) : []).sort(() => Math.random() - 0.5).slice(0,3)
    const tags      = { subjects }

    return { id, title, summary:stripHtml(summary).result, mediaImage, tags, href }
}
