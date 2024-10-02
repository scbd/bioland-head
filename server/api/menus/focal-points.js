import   clone           from 'lodash.clonedeep';

const focalPointTypes = [ 'CBD-FP1', 'CHM-FP',   'ABS-FP', 'BCH-FP', 'CPB-FP1' ];
const focalPointAll = [ 'CBD-FP1',  'CBD-FP2', 'CPB-FP1', 'ABS-FP', 'CHM-FP', 'BCH-FP', 'CPB-A17-FP', 'RM-FP', 'PA-FP', 'TKBD-FP', 'SBSTTA-FP', 'GTI-FP', 'GSPC-FP' ];

export default cachedEventHandler(async (event) => {
        try{
            const context    = getContext(event);
            const query      = getQueryString(context);


            const response   = await $indexFetch(query);

            
            const countryMap = mapByCountry(response, context);

            const links = getLinks(countryMap);

            await getProtocolContacts(context, links);

            return links
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/menus/focal-points.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/menus/focal-points.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
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
        tMap[aCountryCode] = []

        for (const aDoc of docs){
     
            if(!aDoc.hostGovernmentss?.includes(aCountryCode.toLowerCase())) continue;

            for (let index = 0; index < aDoc.types.length; index++) {
        
                const tKey  = aDoc.types[index];

                if( !tMap[aCountryCode] )  tMap[aCountryCode]  ={}
                tMap[aCountryCode] [tKey] = aDoc.url
                
               // tMap[aCountryCode] = Array.from(new Set([ ...tMap[aCountryCode], tKey ]))
            }
        }
    }

    const countryTypeMap = {};
    for (const aCountryCode of countries) {
        countryTypeMap[aCountryCode] = {};//};

        for (const type of focalPointTypes) {
            const aLink = tMap[aCountryCode][type];

            if(!aLink) continue;

            countryTypeMap[aCountryCode][type]=aLink
        }
        // if(countryTypeMap[aCountryCode].includes('ABS-FP'))
        //     countryTypeMap[aCountryCode].push('ABSCH-FP')
    }
    return countryTypeMap
}

function getQueryString({ countries, country, indexLocal }={}){
    
    const fields = getIndexFocalPointTypesFields(indexLocal);
    const q      = getIndexQuery('focalPoint', { countries, country });
    const rows   = `rows=500&sort=createdDate_dt+desc&start=0&wt=json`;

    return q+'&'+fields+'&'+rows;
}

async function getProtocolContacts(ctx, map){
    const { countries } = ctx;

    if(countries || !countries?.length) return;
    const promises = [];
    for (const country of countries) {
        const promiseAbs = getAbsContacts(ctx, country)
                            .then((resp)=>getAbsLinks(resp, map[country], country));

        const promiseBch = getBchContacts(ctx, country)
                            .then((resp)=>getBchLinks(resp, map[country], country));

        promises.push(promiseAbs);
        promises.push(promiseBch);
    }

    return Promise.all(promises);
}

async function getBchContacts(ctx, country){
    const query   = { rowsPerPage: 1, realms: ['BCH'], schemas: [ 'authority', 'supplementaryAuthority', 'contact' ]};
    const context = clone(ctx);
    context.country = country;
    context.countries = [country]
    const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || {}))};` };

    return await $fetch('/api/list/chm', { query, method:'get', headers });
}

async function getAbsContacts(ctx, country){
    const query   = { rowsPerPage: 1, realms: ['ABS'], filter:[country], schemas: [ 'authority', 'supplementaryAuthority', 'contact' ]};
    const context = clone(ctx);
    context.country = country;
    context.countries = [country]
    const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || {}))};` };

    return $fetch('/api/list/chm', { query, method:'get', headers });
}

function getAbsLinks({ facetCounts }, countryList, country){
    const schemaCountArray = facetCounts?.facet_pivot['schema_s, all_Terms_ss'] || [];

    for (const { field, value, count } of schemaCountArray) {
        if(field !== 'schema_s') continue;

        if(value !== 'authority') continue;

        countryList.push({ href: `https://absch.cbd.int/en/search?currentPage=1&schema=${value}&country=${country}`, title: 'absch-'+value, target: '_blank', count });
    }
}

function getBchLinks({ facetCounts }, countryList, country){
    const schemaCountArray = facetCounts?.facet_pivot['schema_s, all_Terms_ss'] || [];

    for (const { field, value, count } of schemaCountArray) {
        if(field !== 'schema_s') continue;

        if(value !== 'authority' && value !== 'supplementaryAuthority') continue;

        countryList.push({ href: `https://bch.cbd.int/en/search?currentPage=1&schema=${value}&country=${country}`, title: 'bch-'+value, target: '_blank', count });
    }
}

function getLinks(countryTypeMap){
    const linksMap = {};

    for (const aCountryCode in countryTypeMap) {
        linksMap[aCountryCode] = []

        const onlyOneCountry = Object.keys(countryTypeMap).length === 1;

        for (const [title, href] of Object.entries(countryTypeMap[aCountryCode]) ) {
            const countryPath = onlyOneCountry? '' : `/${aCountryCode}`;
            const url        =  `/focal-points${countryPath}#${title}`;

            // const title       = type;


            linksMap[aCountryCode].push({ href, title, url });
        }
        const bbi = { href:`https://www.cbd.int/biobridge/platform/search?schema_s=bbiContact&hostGovernments_ss=${aCountryCode}`, title:'BBI Contacts' } 
        linksMap[aCountryCode].push(bbi);
    }

    return linksMap;
}
