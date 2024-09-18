
export default cachedEventHandler(async (event) => {
    try{
        const ctx        = getContext    (event);


        return getComments(ctx);
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