export default defineCachedEventHandler(async (event) => {
        try{
            const query            = getQuery(event);
            const ctx              = await useRequestContext(event);

            const { countries:c, country } = { ...ctx, ...query }

            // Ensure countries is an array, fallback to country if available
            const countriesArray = Array.isArray(c) ? c : (c ? [c] : (country ? [country] : []));
            const countries = countriesArray.filter(x => x);

            if (!countries.length) {
                return { occurrences: 0, publishers: 0, datasets: 0 };
            }

            const countryQueryString = countries.map((s)=>`country=${s.toUpperCase()}`).join('&');
            const uri  = `https://api.gbif.org/v1/occurrence/search?${countryQueryString}&limit=0&facet=publishingOrg&facetLimit=10000`;
            const uri2 = `https://api.gbif.org/v1/dataset?${countryQueryString}`;

            const data = await Promise.all([$fetch(uri, $fetchBaseOptions({ mode: 'cors' })).then(mapOccurrence),$fetch(uri2, $fetchBaseOptions({ mode: 'cors' })).then(mapDataSets)])

            return { ...data[0], ...data[1] }
        }
        catch (e) {
            passError(event, e);
        }
    
    },
    getExternalShortCacheOptions('gbif-summary')
)

function mapOccurrence({ count, facets }){

    return { occurrences: count, publishers: facets[0]?.counts?.length }
}
function mapDataSets({ count:datasets}){

    return { datasets }
}