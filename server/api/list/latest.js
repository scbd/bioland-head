import { DateTime } from 'luxon';

export default cachedEventHandler(async (event) => {
    try{
        const drupalInternalIds = [ 2, 3 ];
        const rowsPerPage = 5;
        const from        = DateTime.now().minus({months: 1}).toFormat('yyyy-MM-dd');
        const schemas     = [ 'news', 'notification', 'statement', 'meeting', 'pressRelease' ];

        const query             = { ...getQuery(event), drupalInternalIds, rowsPerPage, from, schemas };
        const context           = getContext (event);

        // return { ...context, ...query }


        const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};` }

        const [ drupalContent, chmContent ] = await Promise.all([
                    $fetch('/api/list/content',      { query, method:'get', headers }),
                    $fetch('/api/list/chm',  { query, method:'get', headers }).then((resp)=>resp.data.map(cleanIndexDataMap))
                ]);
 //const resp = $fetch('/api/list/chm',  { query, method:'get', headers })//await $fetch('/api/list/content',      { query, method:'get', headers })
        return sortData([ ...drupalContent.data, ...chmContent ]);
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/latest`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey
})


function sortData(data){
    const stickies = data.filter(({ sticky })=> sticky);

    const rest = data.filter(({ sticky })=> !sticky).sort(sortDates);

    return [ ...stickies, ...rest ]
}

function sortDates(a,b){
    const aDate = DateTime.fromISO(a.fieldStartDate || a.startDate || a.fieldPublished || a.changed || a.updatedDate);
    const bDate = DateTime.fromISO(b.fieldStartDate || b.startDate || b.fieldPublished || b.changed || b.updatedDate);

    if(aDate > bDate) return -1;
    if(bDate > aDate) return 1;

    return 0;

}
function cleanIndexDataMap(record){
    record.href =record.urls[0];

    if(record.eventCountry)
        record.eventCountry = JSON.parse(record.eventCountry).en;

    return record
}