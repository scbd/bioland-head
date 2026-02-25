
export default defineCachedEventHandler(async (event) => {
        try{
            const ctx     = await useRequestContext(event);
            const country = await getCountryName(event, getCountryCode(ctx));

            const body = new FormData();
    
            body.append('action', 'fetch_data');
            body.append('country', country);
            body.append('code', getCountryCode(ctx).toUpperCase())

            const headers =  { "Accept": "application/json" }
            const data    = ( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, $fetchBaseOptions({  method: 'POST', body,headers,  mode: 'cors' }))).replaceAll(/\n/g,'');

            const dataObject = parseJson(data);

            if(!dataObject)
                consola.warn({ statusCode: 404, statusMessage: 'Not Found', message: `No GEO BON data found for country: ${country}` });

            return dataObject //|| createError({ statusCode: 404, statusMessage: 'Not Found', message: `No GEO BON data found for country: ${country}` });
        }
        catch (e) {
            passError(event, e);
        }
    }
)

