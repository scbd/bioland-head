import { stripHtml } from "string-strip-html";
import { smartTruncate } from '~~/shared/utils/text';

export default cachedEventHandler(async (event) => {
        try{
            const query            = getQuery(event);
            const ctx              = await useRequestContext(event);

            const { locale, countries } = { ...ctx, ...query }

            const { panoramaKey }  = useRuntimeConfig();
            const panoLocales      = ['en', 'fr', 'es'];
            const panoLocale       = panoLocales.includes(locale)? locale.toLowerCase() : 'en';

            // Normalize countries to array (query params with single value come as string)
            const countriesArray = Array.isArray(countries) ? countries : (countries ? [countries] : []);
            
            if (!countriesArray.length)
                throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'countries parameter is required' });

            
            const countryQueryString = countriesArray.filter(x=>x).map((s)=>`country_iso_2[]=${s.toUpperCase()}`).join('&');
            const uri = `https://panorama.solutions/${panoLocale}/api/v1/solutions?api_key=${panoramaKey}${countryQueryString? `&${countryQueryString}` : ''}`

            const silentError = true;
            const headers = {
                                'User-Agent': `Mozilla/5.0 (compatible; BiolandHead/1.0; +${ctx.host})`,
                                'Accept': 'application/json',
                            }
            
            const options = { ...$fetchBaseOptions, headers, silentError };
            const data    = (await $fetch(uri, options ).then(({ solutions }) => solutions)).map(({ solution }) => solution).map((s) => mapPanoData(s, panoLocale));

            return data.slice(0, 5)
        }
        catch (e) {

            consola.warn( `server/api/list/panorama fetch api error: https://panorama.solutions/en/api/v1/solutions`, e.message );

            return [];

        }
    },
    getExternalCacheOptions('panorama')
)

function mapPanoData({ id, url:href, title, summary, preview_image: mediaImage, classifications }, locale = 'en'){
    const { theme } = classifications || {};

    const subjects  = (theme?.length? theme.map((name)=> ({ name })) : []).sort(() => Math.random() - 0.5).slice(0,3)
    const tags      = { subjects }

    return { id, title, summary: smartTruncate(summary, 500, locale), mediaImage, tags, href }
}
