export default defineEventHandler(async (event) => {
        try{
            const siteCode   = getRouterParam(event, 'siteCode');
            const l          = getRouterParam(event, 'locale');
            const ctx        = { siteCode };
            const config     = await getSiteConfig(ctx);
            const locale     = isValidLocale(l)? l : config?.defaultLocale;
            const host       = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            
            if(!siteCode) throw createError({ statusCode: 404, message: `Site code not found in request`, statusMessage:'Not Found' });
            if(!config?.locales?.includes(locale) && locale !== config?.defaultLocale)
                throw createError({ statusCode: 404, message: `Locale [${locale}] not found in site [${siteCode}] config`, statusMessage:'Not Found' });

            const siteName = await getSiteDefinedName({ ...ctx, locale, config });

            await cleanStorage();
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
            passError(event, e);
        }
    }
);

function isValidLocale(locale){
    const { locales } = useRuntimeConfig().public;
    const   languages = locales.map(l => l.language);

    return languages.includes(locale);
}