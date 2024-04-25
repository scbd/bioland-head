export default cachedEventHandler(async (event) => {
    try{
        const ctx =  getContext(event)

        return  getDefaultLocale(ctx)
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to  query default locale',
        }); 
    }
    
},{
    maxAge: 60 * 60 * 24,
    getKey,
    base:'db'
})
