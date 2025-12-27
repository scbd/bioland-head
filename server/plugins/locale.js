/**
 * Locale Redirect Plugin
 * 
 * Handles locale prefix redirects:
 * - Root path "/" redirects to "/{defaultLocale}"
 * - Invalid locale paths redirect to "/{defaultLocale}/{path}"
 * 
 * Uses the unified context system (DMSM config is cached)
 */
// Server utils (useRequestContext) are auto-imported by Nuxt

export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['/_i18n','/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico','/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];

        // Check if path should be skipped
        for(let path of skipPaths) {
            if(event.path.includes(path)) return;
        }

        await handleLocaleRedirect();
        await handleTaxonomyTermAlias();


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

        /**
         * Redirects /taxonomy/term/{id} paths to their alias or homepage.
         */
        async function handleTaxonomyTermAlias(){
            try {
                const taxonomyTermMatch = event.path.match(/^\/([a-z]{2})\/taxonomy\/term\/(\d+)/);
                
                if(!taxonomyTermMatch) return;

                const locale = taxonomyTermMatch[1];
                const termId = taxonomyTermMatch[2];
                const termPath = `/taxonomy/term/${termId}`;
                
                const ctx = await useRequestContext(event);
                
                // Preserve query string in redirects
                const queryString = event.node.req.url?.split('?')[1];
                const queryPart = queryString ? `?${queryString}` : '';
                
                // If this term is the homepage, redirect to root
                if(ctx.homePath === termPath) {
                    return sendRedirect(event, `/${locale}${queryPart}`, 301);
                }
                
                // Otherwise, check if there's an alias for this term in the requested locale
                const allAliases = await getTermAliasById(ctx, termId, true);
                const aliasData = allAliases?.find(a => a.langcode === locale);
                
                if(aliasData?.alias) {
                    return sendRedirect(event, `/${locale}${aliasData.alias}${queryPart}`, 301);
                }
            } catch (error) {
                return;
            }
        }
    });
})