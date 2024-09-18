
export default cachedEventHandler(async (event) => {
    try{
        const query      = getQuery      (event);
        const ctx        = getContext    (event);

   
        const { pathname } = new URL(getRequestURL(event))
        // consola.warn('path index ',pathname)

        return {}//getComments({event,...ctx,...query });
    }
    catch(e){
        consola.error(e);
        consola.error(e.response);
        throw createError({
            statusCode: 500,
            statusMessage: `/api/comments/ Failed to list reply comments`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db',
    varies:['host', 'x-forwarded-host'],
    shouldBypassCache,
    shouldInvalidateCache
})