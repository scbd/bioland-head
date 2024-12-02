
export default cachedEventHandler(async (event) => {
        try{
            const ctx     = getContext (event);
            const country = await getCountryName(getCountryCode(ctx));

            const body = new FormData();
    
            body.append('action', 'fetch_data');
            body.append('country', country);

            const headers =  { "Accept": "application/json" }
            const data    =( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, {  method: 'POST', body,headers,  mode: 'cors' })).replaceAll(/\n/g,'');

            const dataObject = parseJson(data);

            dataObject.data  = dataObject.data.map((r)=>{
                r.ecosystemType = r.ecosystem_type.split(',').map(e=>e.trim());
                return r
            });
            //dataObject.ecosystemType.split(',').map(e=>e.trim());

            return dataObject
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/geobon.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/geobon.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    externalCache
)
