import { DateTime } from 'luxon';
import { kebabCase } from 'change-case';


export default defineEventHandler(async (event) => {
        try{
          const rowsPerPage = 10;
          const bchRowsPerPage = 1;
          const from = DateTime.now()
            .minus({ months: 24 })
            .toFormat("yyyy-MM-dd");
          const to = DateTime.now().plus({ months: 3 }).toFormat("yyyy-MM-dd");
          const schemas = [
            "news",
            "notification",
            "statement",
            "meeting",
            "pressRelease",
          ];
          const schemaTypes = ["scbd"]; // Only fetch SCBD types, not reference types
          
          // Base query (no date filters, no schemaTypes)
          const baseQuery = {
            ...getQuery(event),
            // 'page[limit]': rowsPerPage,
            // 'page[offset]': 0,
            schemas,
            promote: true,
          };
          
          // Query for BCH endpoint (includes schemaTypes and date filters)
          const bchQuery = {
            schemas,
            schemaTypes,
            rowsPerPage: bchRowsPerPage
          };
          
          const context = getContext(event);

          const headers = {
            Cookie: `context=${encodeURIComponent(
              JSON.stringify(context || {})
            )};`,
          };


          // Schema 2 = news, Schema 49 = announcements, Schema 3 = meetings
          // News & announcements: no future date (use changed/published dates)
          // Meetings: include future dates (use field_start_date)
          const [newsContent, bchContent] = await Promise.all([
            $fetch(
              "/api/list/drupal",
              $fetchBaseOptions({
                query: { ...baseQuery, drupalInternalIds: [2, 49, 3] },
                method: "get",
                headers,
              })
            ),
            // $fetch(
            //   "/api/list/drupal",
            //   $fetchBaseOptions({
            //     query: { ...baseQuery, drupalInternalIds: [3], from, to },
            //     method: "get",
            //     headers,
            //   })
            // ),
            $fetch(
              "/api/list/bch",
              $fetchBaseOptions({
                query: bchQuery,
                method: "get",
                headers,
              })
            ).then((resp) => resp.data.map(cleanIndexDataMap)),
          ]);


          const top3Articles = await getTop3BchArticles(context?.locale || 'en');

          return sortData([
            ...(newsContent?.data || []), 
            ...(bchContent || []),
            ...(top3Articles || [])
          ]);
        }
        catch (e) {
            passError(event, e);
        }
    }
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


    // if(record.eventCountry)
    //     record.eventCountry = JSON.parse(record.eventCountry);

    if(record?.eventCountry_CEN_ss?.length)
        record.eventCountry = JSON.parse(record.eventCountry_CEN_ss);


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