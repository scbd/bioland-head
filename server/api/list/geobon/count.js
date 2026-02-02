
export default defineCachedEventHandler(async (event) => {
        try{
            const ctx     = await useRequestContext(event);
            const country = await getCountryName(event, getCountryCode(ctx));

            const body = new FormData();
    
            body.append('action', 'fetch_data');
            body.append('country', country);

            const headers =  { "Accept": "application/json" }
            const data    =( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, $fetchBaseOptions({  method: 'POST', body,headers,  mode: 'cors' }))).replaceAll(/\s/g,'');

            const count = parseJson(data)?.count || 0;
            
            if (count === 0) {
                consola.warn({ statusCode: 404, statusMessage: 'Not Found', message: 'No GEO BON records found for this country' });
            }
            
            return { count }|| 0;
        }
        catch (e) {
            return passError(event, e);
        }
    },
    getExternalCacheOptions('geobon-count')
)


