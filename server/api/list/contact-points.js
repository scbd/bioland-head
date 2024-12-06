import   clone           from 'lodash.clonedeep';

const focalPointTypes = [ 'CBD-FP1', 'CHM-FP',   'ABS-FP', 'BCH-FP', 'CPB-FP1' ];
const focalPointAll = [ 'CBD-FP1',  'CBD-FP2', 'CPB-FP1', 'ABS-FP', 'CHM-FP', 'BCH-FP', 'CPB-A17-FP', 'RM-FP', 'PA-FP', 'TKBD-FP', 'SBSTTA-FP', 'GTI-FP', 'GSPC-FP' ];

export default cachedEventHandler(async (event) => {
        try{
            const context    = getContext(event);
            const query      = getQueryString(context);
            const response   = await $indexFetch(query);
            const countryMap = mapByCountry(response, context);

            return countryMap
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/contact-points.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/contact-points.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    
    },
    externalCache
)

function mapByCountry({ docs }, ctx){

    const countries = ctx.countries;

    if(!docs || !countries?.length) return [];

    const tMap = {};

    for (const aCountryCode of countries) {
        tMap[aCountryCode] = {}
       
        for (const aDoc of docs){
           
            if(!aDoc.hostGovernmentss?.includes(aCountryCode.toLowerCase())) continue;

           // tMap[aCountryCode].push(aDoc)
            for (let index = 0; index < aDoc.types.length; index++) {
        
                const tKey  = aDoc.types[index];

                if(!tMap[aCountryCode][tKey]) tMap[aCountryCode][tKey ]=[]
                tMap[aCountryCode][tKey].push(aDoc)
                
                tMap[aCountryCode][tKey] = uniqueArrayOfObjects(tMap[aCountryCode][tKey])
            }
        }
    }

    for (const code in tMap) {
        const country = tMap[code];
        country['CBD']= uniqueArrayOfObjects([...country['CBD-FP1']||[], ...country['CBD-FP1']||[]])
        delete country['CBD-FP1']
        delete country['CBD-FP2']
    }
    return tMap
}

function getQueryString({ countries, country, indexLocal }={}){
    
    const fields = getIndexFocalPointTypesFieldsFull(indexLocal);
    const q      = getIndexQuery('focalPoint', { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows; //q+'&'+rows; //
}







