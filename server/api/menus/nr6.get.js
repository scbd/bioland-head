

export default cachedEventHandler(async (event) => {
    try{
        const context = getContext(event);

        const queryString = getIndexQuery('nationalReport6', context) + '&' +getIndexNrFields(context.locale);

        const resp = await $indexFetch (queryString, context);

        return mapByCountry(resp, context)

    }
    catch(e){
        console.log(e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the chm api for nr6',
        }) 
    }
    
},{
    maxAge: 60 * 60 * 24,
    getKey,
    base:'db'
})

function mapByCountry({ docs }, ctx){

    // console.log('===============',docs)
    // return docs
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

    // const countryTypeMap = {};
    // for (const aCountryCode of countries) {
    //     countryTypeMap[aCountryCode] = [];
    //     for (const type of focalPointTypes) {
    //         const aLink = tMap[aCountryCode].find((t)=> t === type)

    //         if(!aLink) continue;

    //         countryTypeMap[aCountryCode].push(aLink)
    //     }

    // }
    return tMap
}