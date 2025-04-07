import { stripHtml } from "string-strip-html"; 
export default cachedEventHandler(async (event) => {
        try{
            const query            = parseQuery   (event);
            const ctx              = getContext (event);

            const { locale, countries } = { ...ctx, ...query }

            const { panoramaKey }  = useRuntimeConfig();
            const panoLocales  = ['en', 'fr', 'es'];
            const panoLocale     = panoLocales.includes(locale)? locale.toLowerCase() : 'en';


            const countryQueryString = Array.isArray(countries) && countries.length? countries.filter(x=>x).map((s)=>`country_iso_2[]=${s.toUpperCase()}`).join('&') : '';
            const uri = `https://panorama.solutions/${panoLocale}/api/v1/solutions?api_key=${panoramaKey}${countryQueryString? `&${countryQueryString}` : ''}`

            const data = (await $fetch(uri,$fetchBaseOptions({ mode: 'cors' }) ).then(({ solutions }) => solutions)).map(({ solution }) => solution).map(mapPanoData);

            return data.slice(0, 5)
        }
        catch (e) {
            passError(event, e);
        }
    },
    externalCache
)

function mapPanoData({ id, url:href, title, summary, preview_image: mediaImage, classifications }){
    const { theme } = classifications || {};

    const subjects  = (theme?.length? theme.map((name)=> ({ name })) : []).sort(() => Math.random() - 0.5).slice(0,3)
    const tags      = { subjects }

    return { id, title, summary:stripHtml(summary).result, mediaImage, tags, href }
}
