const focalPointTypes = [ 'CBD-FP1', 'CBD-FP2', 'CPB-FP1', 'ABS-FP', 'CHM-FP', 'BCH-FP', 'CPB-A17-FP', 'RM-FP', 'PA-FP', 'TKBD-FP', 'SBSTTA-FP', 'GTI-FP', 'GSPC-FP' ];

export default cachedEventHandler(async (event) => {
    try{
        const context = getContext(event);
        const query   = getQueryString(context);

        const response = await $indexFetch(query);
        const countryMap = mapByCountry(response, context);

        return getLinks(countryMap)
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query focal points',
        }); 
    }
    
},{
    maxAge: 60 * 60 * 24,
    varies:['Cookie']
})

function mapByCountry({ docs }, ctx){

    const countries = !ctx?.country? [ ...(ctx?.countries || [])] : [ ctx.country, ...(ctx?.countries || []) ];

    if(!docs || !countries?.length) return [];

    const tMap = {};

    for (const aCountryCode of countries) {
        tMap[aCountryCode] = []

        for (const aDoc of docs){
            if(!aDoc.hostGovernmentss?.includes(aCountryCode)) continue;

            for (let index = 0; index < aDoc.types.length; index++) {
        
                const tKey  = aDoc.types[index];

                tMap[aCountryCode] = Array.from(new Set([ ...tMap[aCountryCode], tKey ]))
            }
        }
    }

    const countryTypeMap = {};
    for (const aCountryCode of countries) {
        countryTypeMap[aCountryCode] = [];
        for (const type of focalPointTypes) {
            const aLink = tMap[aCountryCode].find((t)=> t === type)

            if(!aLink) continue;

            countryTypeMap[aCountryCode].push(aLink)
        }

    }
    return countryTypeMap
}

function getQueryString({ countries, country, indexLocal }={}){
    
    const fields = getIndexFocalPointTypesFields(indexLocal);
    const q      = getIndexQuery('focalPoint', { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows;
}

function getLinks(countryTypeMap){
    const linksMap = {};

    for (const aCountryCode in countryTypeMap) {
        linksMap[aCountryCode] = []

        const onlyOneCountry = Object.keys(countryTypeMap).length === 1;

        for (const type of countryTypeMap[aCountryCode] ) {
            const countryPath = onlyOneCountry? '' : `/${aCountryCode}`;
            const href        =  `/focal-points${countryPath}#${type}`;
            const title       = type;


            linksMap[aCountryCode].push({ href, title });
        }
    }

    return linksMap;
}
