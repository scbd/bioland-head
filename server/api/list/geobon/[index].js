
export default defineCachedEventHandler(async (event) => {
        try{
            const ctx     = await useRequestContext(event);
            const country = await getCountryName(event, getCountryCode(ctx));
            const index   = getRouterParam(event, 'index')
            const body    = new FormData();
    
            body.append('action', 'fetch_data');
            body.append("country", isPlainObject(country) ? country?.name: country);
            body.append('code', getCountryCode(ctx).toUpperCase())

            const headers =  { "Accept": "application/json", 'User-Agent': `Mozilla/5.0 (compatible; BiolandHead/1.0; +${ctx.host})`}
            const data    = ( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, $fetchBaseOptions({  method: 'POST', body, headers,  mode: 'cors' }))).replaceAll(/\n/g,'');

            const dataObject = parseJson(data);

            dataObject.data  = dataObject.data.map((r)=>{
                if(r.ecosystem_type)
                    r.ecosystemType = r.ecosystem_type.split(',').map(e=>e.trim());
                return r
            });

            const record = dataObject?.data[index || 0];
            
            if (!record) {
                consola.warn({ statusCode: 404, statusMessage: 'Not Found', message: `No GEO BON record found for index: ${index}` });
            }
            
            return record || {};
        }
        catch (e) {
            return passError(event, e);
        }
    },
    getExternalCacheOptions('geobon-record', true, CACHE_TTL.FIVE_MINUTES)
)



