import { DateTime } from 'luxon';
import { kebabCase } from 'change-case';

export default cachedEventHandler(async (event) => {
        try{
            const drupalInternalIds = [ 2, 3 ];
            const rowsPerPage = 20;
            const from        = DateTime.now().minus({months: 1}).toFormat('yyyy-MM-dd');
            const schemas     = [ 'news', 'notification', 'statement', 'meeting', 'pressRelease' ];

            const query             = { ...getQuery(event), drupalInternalIds, rowsPerPage, from, schemas };
            const context           = getContext (event);


            const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};` }

            const [ drupalContent, chmContent ] = await Promise.all([
                        $fetch('/api/list/content',      { query, method:'get', headers }),
                        $fetch('/api/list/chm',  { query, method:'get', headers }).then((resp)=>resp.data.map(cleanIndexDataMap))
                    ]);

            return sortData([ ...drupalContent.data, ...chmContent]); //
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/latest.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/latest.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    // listCache
)


function sortData(data){
    const stickies = data.filter(({ sticky })=> sticky);

    const rest = data.filter(({ sticky })=> !sticky).sort(sortDates);

    return [ ...stickies, ...rest ]
}

function sortDates(a,b){
    const aDate = DateTime.fromISO(a.changed || a.updatedDate || a.fieldPublished || a.fieldStartDate || a.startDate);
    const bDate = DateTime.fromISO(b.changed || b.updatedDate || b.fieldPublished || b.fieldStartDate || b.startDate);

    if(aDate > bDate) return -1;
    if(bDate > aDate) return 1;

    return 0;
}

function cleanIndexDataMap(record){
    record.href =record.urls[0];

    if(record.eventCountry)
        record.eventCountry = JSON.parse(record.eventCountry);

    if(record.eventCountry_CEN)
        record.eventCountry = JSON.parse(record.eventCountry_CEN);


    return record
}

const imageCountMap = {
    news: 8,
    notification: 2,
    statement: 1,
    meeting: 8,
    pressRelease: 2
}

function getRandomImage(record){

    const max    = imageCountMap[record.schema] || 14
    const type   = imageCountMap[record.schema]? kebabCase(record.schema): 'other';
    const random = Math.floor(Math.random() * (max - 1 + 1) + 1)
    const alt    = record.title || record.name || record.fieldTitle || record.fieldName;
    const src    = `/images/types/${type}/${random}.jpg`;

    return { alt, src, title:src }
}
//alt :  "International Biodiversity Day Celebration - 2023" filename :  "Picture6.jpg" height :  286 src :  "https://rjh.bl2.cbddev.xyz/sites/rjh/files/2023-11/Picture6.jpg" title :  "" width :  472