import clone from 'lodash.clonedeep';

export default defineEventHandler(async (event) => {
    try{
        const query            = getQuery   (event);
        const ctx              = getContext (event);

        const promises      = [];
        const   schemas     = ['nationalTarget7'];
        const allCountries  = ({ ...ctx, ...query }).countries;
        const countryMap    = {}

        for (const country of Array.isArray(allCountries)? allCountries : [allCountries]) {
            const countries = [country];

            promises.push(getAllBySchemas({ ...ctx, ...query,  countries  }, schemas, countries)
            .then((response) => {
                const targets = limitArrayToX(shuffleArrayHourly(response.data),4).sort(sortNT7byToc);

                if(!targets?.length) return;
                
                countryMap[country] = targets;
            }))
        }
        await Promise.all(promises);    


        return  countryMap;


    }
    catch (e) {
        passError(event, e);
    }
},
// externalCache
)
