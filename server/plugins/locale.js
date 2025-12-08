
export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['_i18n','/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico','/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];

        // Check if path should be skipped
        for(let path of skipPaths) {
            if(event.path.includes(path)) return;
        }

        await isValidLocalePrefix();


        async function isValidLocalePrefix(){
            try {
                const host           = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
                let ctx              = getContext(event);
                
                // If no context cookie, we need to fetch from DMSM to get defaultLocale
                if(!ctx || !ctx.defaultLocale || !ctx.locales) {
                    // Extract siteCode from hostname (e.g., seed.localhost -> seed)
                    const siteCode = host?.split('.')[0];
                    if (!siteCode) return;
                    
                    // Fetch DMSM config to get defaultLocale
                    const { baseHost, dmsm, env, multiSiteCode } = useRuntimeConfig().public;
                    const configUrl = `${dmsm}/config/${env}/${multiSiteCode}/${siteCode}`;
                    
                    try {
                        const config = await $fetch(configUrl);
                        if (config?.defaultLocale && config?.locales) {
                            ctx = {
                                defaultLocale: config.defaultLocale,
                                locales: config.locales,
                                siteCode
                            };
                        } else {
                            return; // Can't proceed without config
                        }
                    } catch (err) {
                        return; // DMSM not available yet
                    }
                }
                
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
                // Silently fail - context not ready yet
                return;
            }
        }
    });
})