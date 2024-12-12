export default cachedEventHandler(async (event) => {
        try{
            const context  = getContext(event);
            const query    = getQueryString(context);
            const response = await $indexFetch(query);

            return mapByGov(response,context);
        }
        catch (e) {

            passError(event, e);
        }
    },
    externalCache
)

function getQueryString({ countries, country, locale }={}){
    
    const fields = getIndexNrFields(locale);
    const q      = getIndexQuery(['nationalReport', 'nationalReport6'], { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows;
}

function mapByGov({ docs }, ctx){

    const countries = !ctx?.country? [ ...(ctx?.countries || [])] : [ ctx.country, ...(ctx?.countries || []) ];

    if(!docs || !countries?.length) return {};

    const tMap = {};

    for (const aCountryCode of countries) {
        tMap[aCountryCode] = []
        
        for (const aDoc of docs){
            if(!aDoc.hostGovernmentss?.includes(aCountryCode)) continue;

            const { urls, title , createdDate} = aDoc;
            const { symbol } = aDoc[`reportType_C${ctx.indexLocale}`]? JSON.parse(aDoc[`reportType_C${ctx.indexLocale}`]) : {}
            const   doc           = { title, href:urls[0], symbol, createdDate, target: '_blank' };

            tMap[aCountryCode] = Array.from(new Set([ ...tMap[aCountryCode], doc ]))

        }
        const nbsaps = tMap[aCountryCode].filter(({ symbol })=> symbol === 'B0EBAE91-9581-4BB2-9C02-52FCF9D82721').sort((a,b)=> sortArrayOfObjectsByProp(a,b, 'createdDate'));
        const nrs =  tMap[aCountryCode].filter(({ symbol })=> symbol !== 'B0EBAE91-9581-4BB2-9C02-52FCF9D82721').sort((a,b)=> sortArrayOfObjectsByProp(a,b, 'createdDate'));

        

        const progress = { title: 'Progress Assessment', href:`https://chm.cbd.int/database?schema_s=nationalAssessment&hostGovernments_ss=${aCountryCode}`, target: '_blank',createdDate:"1913-05-02T18:36:31.137Z"}
        const targets = { title: 'National Targets', href:`https://chm.cbd.int/database?schema_s=nationalTarget&hostGovernments_ss=${aCountryCode}`, target: '_blank',createdDate:"1914-05-02T18:36:31.137Z"}

        tMap[aCountryCode] = [ ...nrs, ...nbsaps, targets, progress]
    }

    return tMap
}

// function sort(a,b, prop){
//     if(a[prop] < b[prop]) return 1; 
//     if(a[prop] > b[prop]) return -1;

//     return 0;
// }