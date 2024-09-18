export default defineEventHandler(async (event) => {
    try{
        const siteCode   = getRouterParam(event, 'siteCode');
        const l          = getRouterParam(event, 'locale');

        const ctx        =  { siteCode };

        const config     = await getSiteConfig(ctx);
        const locale     = isValidLocale(l)? l : config?.defaultLocale;
    
        if(!config?.locales?.includes(locale) && locale !== config?.defaultLocale)
            throw createError({ statusCode: 404, message: `Locale [${locale}] not found in site [${siteCode}] config`, statusMessage:'Not Found' });
                                
        const defaultLocale = (await getDefaultLocale({ ...ctx, locale,config }) || {}).locale;
        const siteName      = await getSiteDefinedName({ ...ctx, locale, config, defaultLocale });

        await cleanStorage();
        
        return  { ...ctx, locale, config, defaultLocale, siteName };

        async function cleanStorage(){
            const keys = await useStorage('db').getKeys();

            for(let key of keys){
                if(key.includes('nitro:handlers:_:undefined')){
                    await useStorage('db').removeItem(key);

                    consola.warn('storage contains undefined key:', key);
                }
            }
        }
    }
    catch(e){
        const   siteCode           = getRouterParam(event, 'siteCode');
        const   locale             = getRouterParam(event, 'locale');
        const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
        const   requestUrl         = new URL(getRequestURL(event));
        const { pathname }         = requestUrl;
        const { baseHost, env }    = useRuntimeConfig().public;

        console.error(e);

        throw createError({
            statusCode    : e.statusCode,
            statusMessage : e.statusMessage,
            message       : `${host}/api/context/[${siteCode}]/[${locale}]: Failed to get initial context from api`,
            data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl }
        }); 
    }
    
})

function isValidLocale(locale){
    const { locales } = useRuntimeConfig().public;
    const   languages = locales.map(l => l.language);

    return languages.includes(locale);
}