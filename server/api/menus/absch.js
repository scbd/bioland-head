
export default cachedEventHandler(async (event) => {
    try{
        const context = getContext(event);

        return getAbschMenus(context);
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the abs for facets',
        }); 
    }
    
},{
    maxAge: 60 * 60 * 24,
    getKey,
    base:'db'
})
