export default cachedEventHandler(async (event) => {
        try{
            const query            = getQuery   (event);
            const ctx              = getContext (event);

            const { locale, rows }  = { ...ctx, ...query }
            const unLocales   = ['en', 'fr', 'es', 'ru', 'ar', 'zh'];
            const indexLocale = unLocales.includes(locale)? locale?.toUpperCase() : 'EN';
            const queryFields = `fl=schema_s,identifier_s,thematicArea_${indexLocale}_ss,country_${indexLocale}_s,logo*,title_${indexLocale}_s,*ate*,government_${indexLocale}_s,city_${indexLocale}_s,country_CEN_s,startDate*,endDate*,organization_${indexLocale}_s,summary_${indexLocale}_s`
            const uri         = `https://api.cbd.int/api/v2013/index/select?${queryFields}&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:bbiRequest)&rows=${rows || 5}&sort=createdDate_dt+desc&start=0&wt=json`

            const data = await $fetch(uri, { mode: 'cors' }).then(({ response }) => response.docs.map(normalizeIndexKeys).map(mapHref));
            return data
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/tsc.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/tsc.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    externalCache
)

function mapHref(obj){
    obj.href = `https://www.cbd.int/biobridge/platform/submit/bbi-Request/${obj.identifier}/view`

    if(obj.country_CEN){
        obj.country_CEN = JSON.parse(obj.country_CEN);

        obj.countryIdentifier =  obj.country_CEN.symbol
    }

    return obj
}