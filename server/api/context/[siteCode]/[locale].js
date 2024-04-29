export default defineEventHandler(async (event) => {
    try{
        const siteCode   = getRouterParam(event, 'siteCode')
        const locale     = getRouterParam(event, 'locale')
        const ctx        =  { siteCode, locale }

        const config     = await getSiteConfig(ctx);


        const defaultLocale = (await getDefaultLocale({ ...ctx, config }) || {}).locale;
        const siteName      = await getSiteDefinedName({ ...ctx, config, defaultLocale })


        return  { ...ctx, config, defaultLocale, siteName }
    }
    catch(e){
        const siteCode = getRouterParam(event, 'siteCode')
        const locale     = getRouterParam(event, 'locale')
        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: ` /api/context/[${siteCode}]/[${locale}]: Failed to get initial context from api`,
        }); 
    }
    
})
