export default cachedEventHandler(async (event) => {
    try{
        const identifier = getRouterParam(event, 'identifier')
        const locale     = getRouterParam(event, 'locale')
        const ctx        =  { identifier, locale }

        const config = await getSiteConfig(ctx);

        const defaultLocale = (await getDefaultLocale({ ...ctx, config }) || {}).locale;
        const siteName      = await getSiteDefinedName({ ...ctx, config, defaultLocale })

        return  { ...ctx, config, defaultLocale, siteName }
    }
    catch(e){
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to get initial context from api',
        }); 
    }
    
},{
    maxAge: 60 * 60
})
