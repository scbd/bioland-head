export default defineEventHandler(async (event) => {
    try{
        const ctx =  getQuery(event)

        const config = await getSiteConfig(ctx);

        const defaultLocale = (await getDefaultLocale({ ...ctx, config }) || {}).locale;
        const siteName      = await getSiteDefinedName({ ...ctx, config, defaultLocale })

        return  {...ctx, config, defaultLocale, siteName}
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get initial context from api',
        }); 
    }
    
})
