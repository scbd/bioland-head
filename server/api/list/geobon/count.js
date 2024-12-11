
export default cachedEventHandler(async (event) => {
        try{
            const ctx     = getContext (event);
            const country = await getCountryName(getCountryCode(ctx));

            const body = new FormData();
    
            body.append('action', 'fetch_data');
            body.append('country', country);

            const headers =  { "Accept": "application/json" }
            const data    =( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, {  method: 'POST', body,headers,  mode: 'cors' })).replaceAll(/\s/g,'');


            return parseJson(data).count
        }
        catch (e) {
            passError(event, e);
        }
    },
    externalCache
)


