export default cachedEventHandler(async (event) => {
        try{
            const siteCode   = getRouterParam(event, 'siteCode');
            const l          = getRouterParam(event, 'locale');
            const ctx        = { siteCode };
            const config     = await getSiteConfig(ctx);
            const locale     = isValidLocale(l)? l : config?.defaultLocale;
            const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            
            if(!siteCode) throw createError({ statusCode: 404, message: `Site code not found in request`, statusMessage:'Not Found' });
            if(!config?.locales?.includes(locale) && locale !== config?.defaultLocale)
                throw createError({ statusCode: 404, message: `Locale [${locale}] not found in site [${siteCode}] config`, statusMessage:'Not Found' });

            const siteName = await getSiteDefinedName({ ...ctx, locale, config });

           
            await cleanStorage();
// consola.warn('/api/conext/[siteCode]/[locale]', { siteCode, locale, config, siteName, defaultLocale: config.defaultLocale });
            const respCtx = { ...ctx, locale, config, siteName, defaultLocale: config.defaultLocale };

            await useStorage('context').setItem(host, respCtx);
            return  respCtx;

            async function cleanStorage(){
                const keys = await useStorage('db').getKeys();

                for(let key of keys)
                    if(key.includes('nitro:handlers:_:undefined'))
                        await useStorage('db').removeItem(key);
            }
        }
        catch (e) {
            const   siteCode           = getRouterParam(event, 'siteCode');
            const   locale             = getRouterParam(event, 'locale');
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/context/[${siteCode}]/[${locale}].js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/api/context/[${siteCode}]/[${locale}]: Failed to get initial context from api`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    contextCache
);

function isValidLocale(locale){
    const { locales } = useRuntimeConfig().public;
    const   languages = locales.map(l => l.language);

    return languages.includes(locale);
}