

export default cachedEventHandler(async (event) => {
    try{

        const path = decodeURIComponent(getRouterParam(event, 'path'))
        const ctx  =  getContext(event)


        return  getPageData({...ctx, path})
    }
    catch(e){
        const path = decodeURIComponent(getRouterParam(event, 'path'));

        throw createError({
            statusCode: 404,
            statusMessage: `Failed to get page from path: ${path}`,
        }); 
    }
    
},{
    maxAge: 1,
    getKey,
    base:'db'
})
