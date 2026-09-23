import { mergeQueryIntoContext } from '../../utils/merge-query-into-context';
export default cachedEventHandler(async (event) => {
        try{
            const { gaiaApi }  = useRuntimeConfig().public;
            const   query      = getQuery   (event);
            const   ctx        = await useRequestContext(event);

            const { locale, rows: rawRows }  = mergeQueryIntoContext(ctx, query);
            // BL-1135 D2: `rows` reaches the upstream URI unbounded and this route's cache key
            // (getExternalCacheOptions) doesn't vary on it, so an oversized `?rows=` could ask
            // gaia for an unbounded result. Clamp to the widget's expected range.
            const   rows             = Math.min(Math.max(Number(rawRows) || 5, 1), 50);
            const   indexLocale     = unLocales.includes(locale)? locale?.toUpperCase() : 'EN';
            const   queryFields     = `fl=schema_s,identifier_s,thematicArea_${indexLocale}_ss,country_${indexLocale}_s,logo*,title_${indexLocale}_s,*ate*,government_${indexLocale}_s,city_${indexLocale}_s,country_CEN_s,startDate*,endDate*,organization_${indexLocale}_s,summary_${indexLocale}_s`;
            const   uri             = `${gaiaApi}/v2013/index/select?${queryFields}&q=NOT+version_s:*+AND+realm_ss:chm+AND+schema_s:*++AND+(schema_s:bbiRequest)&rows=${rows}&sort=createdDate_dt+desc&start=0&wt=json`;

            return await $fetch(uri, $fetchBaseOptions({ mode: 'cors' })).then(({ response }) => response.docs.map(normalizeIndexKeys).map(mapHref));
        }
        catch (e) {
            passError(event, e);
        }
    },
    getExternalCacheOptions('biobridge')
)

function mapHref(obj){
    obj.href = `https://www.cbd.int/biobridge/platform/submit/bbi-Request/${obj.identifier}/view`

    if(obj.country_CEN){
        obj.country_CEN = JSON.parse(obj.country_CEN);

        obj.countryIdentifier =  obj.country_CEN.symbol
    }

    return obj
}