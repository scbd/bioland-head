import { menusCache } from "~/server/utils/cache";


export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            const queryString = getIndexQuery('nationalReport6', context) + '&' +getIndexNrFields(context.locale);

            const resp = await $indexFetch (queryString, context);

            return mapByCountry(resp, context)

        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/menus/nr6.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/menus/nr6.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
            }); 
        }
    },
    menusCache
)

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