export default defineEventHandler(async (event) => {
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
    
})
