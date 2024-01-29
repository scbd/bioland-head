

export default cachedEventHandler(async (event) => {
    try{

        const path = decodeURIComponent(getRouterParam(event, 'path'))
        const ctx  =  getContext(event)


        return  getPageData({...ctx, path})
    }
    catch(e){

        // throw createError({
        //     statusCode: 500,
        //     statusMessage: 'Failed to get page data',
        // }); 
    }
    
},{
    maxAge: 1,
    getKey
})
