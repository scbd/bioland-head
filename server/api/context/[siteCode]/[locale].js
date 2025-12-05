export default defineEventHandler(async (event) => {
        try{
            const siteCode   = getRouterParam(event, 'siteCode');
            const l          = getRouterParam(event, 'locale');
            const ctx        = { siteCode };
            const config     = await fetchSiteConfig(ctx);
            
            // If locale is 'und' (undefined), use DMSM defaultLocale
            // Otherwise, validate the requested locale
            const locale     = (l === 'und' || !isValidLocale(l)) ? config?.defaultLocale : l;
            const host       = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            
            if(!siteCode) throw createError({ statusCode: 404, message: `Site code not found in request`, statusMessage:'Not Found' });

            if(!config?.locales?.includes(locale) && locale !== config?.defaultLocale)
                throw createError({ statusCode: 404, message: `Locale [${locale}] not found in site [${siteCode}] config`, statusMessage:'Not Found' });

            const siteName = await getSiteDefinedName({ ...ctx, locale, config });

            const respCtx = { ...ctx, locale, config, siteName, defaultLocale: config.defaultLocale, host };


            return  respCtx;

            function isValidLocale(locale){
                const { locales } = useRuntimeConfig().public;
                const   languages = locales.map(l => l.language);
            
                return languages.includes(locale);
            }
        }
        catch (e) {
            passError(event, e);
        }
    }
);