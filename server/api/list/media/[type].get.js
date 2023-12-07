

export default cachedEventHandler(async (event) => {
    try{
        const query = getQuery(event);
        const type  = getRouterParam(event, 'type');
        const ctx   =  getContext(event);

        return  getPageData({...ctx, path})
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get page data',
        }); 
    }
    
},{
    maxAge: 5,
    varies:['Cookie']
})
