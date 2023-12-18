import { DateTime } from 'luxon';

export default cachedEventHandler(async (event) => {
    try{
        const drupalInternalIds = [ 2, 3 ];
        const rowsPerPage = 5;
        const from        = DateTime.now().minus({months: 1}).toFormat('yyyy-MM-dd');
        const schemas     = [ 'news', 'notification', 'statement', 'meeting', 'pressRelease' ];

        const query             = { ...getQuery(event), drupalInternalIds, rowsPerPage, from, schemas };
        const context           = getContext (event);

        // return { ...context, ...query }


        const headers = { Cookie: `context=${encodeURIComponent(JSON.stringify(context || query || {}))};` }

        // const [ drupalContent, chmContent ] = await Promise.all([
        //             $fetch('/api/list',      { query, method:'get', headers }),
        //             // $fetch('/api/list/chm',  { query, method:'get', headers })
        //         ]);
const resp = await $fetch('/api/list/content',      { query, method:'get', headers })
        return resp//drupalContent//[ ...drupalContent, ...chmContent ];
    }
    catch(e){
        consola.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to get list/latest`,
        }); 
    }
    
},{
    maxAge: 1,
    varies:['Cookie']
})
