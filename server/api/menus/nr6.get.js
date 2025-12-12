export default cachedEventHandler(async (event) => {
        try{
            const ctx = await useRequestContext(event);

            const queryString = getIndexQuery('nationalReport6', ctx) + '&' +getIndexNrFields(ctx.locale);

            const resp = await $indexFetch (queryString, ctx);

            return mapByCountry(resp, ctx);

        }
        catch (e) {
            passError(event, e);
        }
    },
    externalCache
)

function mapByCountry({ docs }, ctx){
    const countries = !ctx?.country? [ ...(ctx?.countries || [])] : [ ctx.country, ...(ctx?.countries || []) ];

    if(!docs || !countries?.length) return {};

    const tMap = {};

    for (const aCountryCode of countries) {
        tMap[aCountryCode] = []
        
        for (const aDoc of docs){
            if(!aDoc.hostGovernmentss?.includes(aCountryCode)) continue;

            const { urls, title } = aDoc;
            const   doc           = { title, href:urls[0] };

            tMap[aCountryCode] = Array.from(new Set([ ...tMap[aCountryCode], doc ]))
        }

    }
    return tMap;
}