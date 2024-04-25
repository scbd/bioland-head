
export default cachedEventHandler(async (event) => {
    try{
        const context = getContext(event);

        return useDrupalTopicMenus(parseContext(context))
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query the installed languages',
        }); 
    }
    
},{
    maxAge: 60 * 5,
    getKey,
    base:'db'
})
