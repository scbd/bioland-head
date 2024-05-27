
export default cachedEventHandler(async (event) => {
    try{
        const context = getContext(event);

        return useContentTypeMenus(parseContext(context));
    }catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the installed content types',
        }); 
    }
    
},{
    maxAge: 60 * 60 * 24, // 30 days
    getKey,
    base:'db'
})
