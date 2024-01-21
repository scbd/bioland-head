export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery   (event);
        const ctx              = getContext (event);

        const { locale } = { ...ctx, ...query }
        const unLocales  = ['en', 'fr', 'es', 'ru', 'ar', 'zh'];
        const indexLocale = unLocales.includes(locale)? locale.toUpperCase() : 'EN';
        const queryFields = `fl=schema_s,identifier_s,thematicArea_${indexLocale}_ss,country_${indexLocale}_s,logo*,title_${indexLocale}_s,*ate*,government_${indexLocale}_s,city_${indexLocale}_s,startDate*,endDate*,organization_${indexLocale}_s,summary_${indexLocale}_s`
        const uri = `https://api.cbd.int/api/v2013/index/select?${queryFields}&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:bbiRequest)&rows=25&sort=createdDate_dt+desc&start=0&wt=json`

        const data = await $fetch(uri, { mode: 'cors' }).then(({ response }) => response.docs.map(normalizeIndexKeys).map(mapHref));
        return data
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

function mapHref(obj){
    obj.href = `https://www.cbd.int/biobridge/platform/submit/bbi-Request/${obj.identifier}/view`

    return obj
}