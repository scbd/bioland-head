/**
 * Locale Redirect Plugin
 * 
 * Handles locale prefix redirects:
 * - Root path "/" redirects to "/{defaultLocale}"
 * - Invalid locale paths redirect to "/{defaultLocale}/{path}"
 * 
 * Uses the unified context system (DMSM config is cached)
 */
import { useRequestContext } from '~/server/utils/context-unified'

export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['_i18n','/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico','/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];

        // Check if path should be skipped
        for(let path of skipPaths) {
            if(event.path.includes(path)) return;
        }

        await handleLocaleRedirect();


        async function handleLocaleRedirect(){
            try {
                // Use unified context (DMSM config is cached)
                const ctx = await useRequestContext(event);
                
                const defaultLocale  = ctx.defaultLocale;
                const pathLocale     = event.path.split('/')[1];
                const isValid        = ctx.locales.includes(pathLocale);

                // Redirect root path to defaultLocale
                if(event.path === '/') {
                    return sendRedirect(event, `/${defaultLocale}`, 301);
                }

                // Redirect invalid locale paths
                if(!isValid && ctx.locales.length) {
                    return sendRedirect(event, `/${defaultLocale}${event.path}`, 301);
                }
            } catch (error) {
                // Context resolution failed - let request continue
                // The actual page handler can decide what to do
                return;
            }
        }
    });
})