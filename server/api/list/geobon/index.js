
export default cachedEventHandler(async (event) => {
        try{
            const ctx     = getContext (event);
            const country = await getCountryName(getCountryCode(ctx));

            const body = new FormData();
    
            body.append('action', 'fetch_data');
            body.append('country', country);

            const headers =  { "Accept": "application/json" }
            const data    =( await $fetch(`https://portal.geobon.org/bioland/fetch-data.php`, $fetchBaseOptions({  method: 'POST', body,headers,  mode: 'cors' }))).replaceAll(/\n/g,'');

            const dataObject = parseJson(data);

            dataObject.data  = dataObject.data.map((r)=>{
                r.ecosystemType = r.ecosystem_type.split(',').map(e=>e.trim());
                return r
            });

            return dataObject
        }
        catch (e) {
            passError(event, e);
        }
    },
    // externalCache
)

