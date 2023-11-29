

export default cachedEventHandler(async (event) => {
    try{
        const context  = getContext(event);
        const query    = getQueryString(context);
        const response = await $indexFetch(query);

        return mapByGov(response,context);
    }
    catch(e){
        console.log(e)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the chm index api for national reports',
        }) 
    }
    
},{
    maxAge: 60 * 60 * 24,
    varies:['Cookie']
})

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
        const nbsaps = tMap[aCountryCode].filter(({ symbol })=> symbol === 'B0EBAE91-9581-4BB2-9C02-52FCF9D82721').sort((a,b)=> sort(a,b, 'createdDate'));
        const nrs =  tMap[aCountryCode].filter(({ symbol })=> symbol !== 'B0EBAE91-9581-4BB2-9C02-52FCF9D82721').sort((a,b)=> sort(a,b, 'createdDate'));

        tMap[aCountryCode] = [ ...nrs, ...nbsaps]
    }

    return tMap
}

function sort(a,b, prop){
    if(a[prop] < b[prop]) return 1; 
    if(a[prop] > b[prop]) return -1;

    return 0;
}
// [
//     {
//       "reportType": "National Biodiversity Strategies and Action Plans (NBSAPs)",
//       "symbol": "B0EBAE91-9581-4BB2-9C02-52FCF9D82721"
//     },
//     {
//       "reportType": "5th National Report (2009-2014)",
//       "symbol": "B3079A36-32A3-41E2-BDE0-65E4E3A51601"
//     },
//     {
//       "reportType": "4th National Report (2005-2009)",
//       "symbol": "272B0A17-5569-429D-ADF5-2A55C588F7A7"
//     },
//     {
//       "reportType": "3rd National Report (2001-2005)",
//       "symbol": "DA7E04F1-D2EA-491E-9503-F7923B1FD7D4"
//     },
//     {
//       "reportType": "2nd National Report (1997-2001)",
//       "symbol": "A49393CA-2950-4EFD-8BCC-33266D69232F"
//     },
//     {
//       "reportType": "1st National Report (1992-1998)",
//       "symbol": "F27DBC9B-FF25-471B-B624-C0F73E76C8B3"
//     }
//   ]