import { useRequestContext } from '~/server/utils/context-unified'

/**
 * Context API Route
 * 
 * Returns site context for client initialization.
 * Uses cached DMSM config to avoid repeated external API calls.
 */
export default defineEventHandler(async (event) => {
        try{
            const siteCode   = getRouterParam(event, 'siteCode');
            const l          = getRouterParam(event, 'locale');
            
            if(!siteCode) {
                throw createError({ statusCode: 404, message: `Site code not found in request`, statusMessage:'Not Found' });
            }

            // Use the unified context resolution (DMSM config is cached)
            const ctx = await useRequestContext(event);
            
            // Override locale if explicitly requested and valid
            let locale = ctx.locale;
            if (l && l !== 'und' && ctx.locales.includes(l)) {
                locale = l;
            }

            // Get site name from Drupal
            const siteName = await getSiteDefinedName({ 
                siteCode, 
                locale, 
                config: ctx.config 
            });

            return {
                siteCode: ctx.siteCode,
                locale,
                defaultLocale: ctx.defaultLocale,
                config: ctx.config,
                siteName,
                host: ctx.host
            };
        }
        catch (e) {
            passError(event, e);
        }
    }
);