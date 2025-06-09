import clone from 'lodash.clonedeep';

export default defineEventHandler(async (event) => {
    try{
        const query            = getQuery   (event);
        const ctx              = getContext (event);

        const schemas = ['nationalTarget7'];
        const countries = ({ ...ctx, ...query }).countries
        const response = await getAllBySchemas({ ...ctx, ...query, countries }, schemas, countries);

        response.data =  limitArrayToX(shuffleArrayHourly(response.data)).sort(sortNT7byToc);

        return  response
    }
    catch (e) {
        passError(event, e);
    }
},
// externalCache
)

