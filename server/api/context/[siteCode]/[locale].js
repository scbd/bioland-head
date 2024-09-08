export default defineEventHandler(async (event) => {
    try{
        const siteCode   = getRouterParam(event, 'siteCode')
        const locale     = getRouterParam(event, 'locale')
        const ctx        =  { siteCode, locale }

        const config     = await getSiteConfig(ctx);


        const defaultLocale = (await getDefaultLocale({ ...ctx, config }) || {}).locale;
        const siteName      = await getSiteDefinedName({ ...ctx, config, defaultLocale });

        await cleanStorage();
        
        return  { ...ctx, config, defaultLocale, siteName };

        async function cleanStorage(){
            const keys = await useStorage('db').getKeys();

            for(let key of keys){
                if(key.includes('nitro:handlers:_:undefined')){
                    await useStorage('db').removeItem(key)

                    consola.warn('storage contains undefined key:', key)
                }
            }
        }
    }
    catch(e){
        const siteCode = getRouterParam(event, 'siteCode')
        const locale   = getRouterParam(event, 'locale')

        console.error(e);
        throw createError({
            statusCode: 500,
            statusMessage: ` /api/context/[${siteCode}]/[${locale}]: Failed to get initial context from api`,
        }); 
    }
    
})

