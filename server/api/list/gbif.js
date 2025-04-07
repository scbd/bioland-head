export default cachedEventHandler(async (event) => {
        try{
            const query            = parseQuery   (event);
            const ctx              = getContext (event);

            const { countries:c } = { ...ctx, ...query }

            const countries = c.filter(x => x)

            const countryQueryString = Array.isArray(countries) && countries.length? countries.filter(x=>x).map((s)=>`country=${s.toUpperCase()}`).join('&') : '';
            const uri  = `https://api.gbif.org/v1/occurrence/search?${countryQueryString}&limit=0&facet=publishingOrg&facetLimit=1000`;
            const uri2 = `https://api.gbif.org/v1/dataset?${countryQueryString}`;


            const data = await Promise.all([$fetch(uri, $fetchBaseOptions({ mode: 'cors' })).then(mapOccurrence),$fetch(uri2, $fetchBaseOptions({ mode: 'cors' })).then(mapDataSets)])

            return { ...data[0], ...data[1] }
        }
        catch (e) {
            passError(event, e);
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