// Server utils (useRequestContext) are auto-imported by Nuxt

/**
 * Context API Route
 * 
 * Returns site context for client initialization.
 * Uses cached DMSM config to avoid repeated external API calls.
 * 
 * Note: We pass explicit siteCode/locale to useRequestContext because
 * internal $fetch calls may not preserve the original host header.
 */
export default defineEventHandler(async (event) => {
        try{
            const siteCode   = getRouterParam(event, 'siteCode');
            const l          = getRouterParam(event, 'locale');
            
            if(!siteCode) {
                throw createError({ statusCode: 404, message: `Site code not found in request`, statusMessage:'Not Found' });
            }

            // Use the unified context resolution with explicit siteCode
            // This bypasses host header extraction which fails on internal fetches
            const ctx = await useRequestContext(event, { 
                siteCode,
                locale: l !== 'und' ? l : undefined 
            });

            // Get site name from Drupal
            const siteName = await getSiteDefinedName({ 
                siteCode, 
                locale: ctx.locale, 
                config: ctx.config 
            });

            return {
                siteCode: ctx.siteCode,
                locale: ctx.locale,
                defaultLocale: ctx.defaultLocale,
                config: ctx.config,
                siteName,
                host: ctx.host,
                locales: ctx.locales
            };
        }
        catch (e) {
            passError(event, e);
        }
    }
);