
export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico','/.well-known','/fonts.googleapis.com','/.well-known/appspecific'];

        // Check if path should be skipped
        for(let path of skipPaths) {
            if(event.path.includes(path)) return;
        }

        await isValidLocalePrefix();


        function isValidLocalePrefix(){
            try {
                const host           = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
                const ctx            = getContext(event);
                
                // Early return if context is not available yet
                if(!ctx || !ctx.defaultLocale || !ctx.locales) return;
                
                const defaultLocale  = ctx.defaultLocale;
                const isValid        = ctx.locales.includes(event.path.split('/')[1]);

                if(isValid || event.path==='/' || !ctx.locales.length) return;

                return sendRedirect(event, `/${defaultLocale}${event.path}`, 301);
            } catch (error) {
                // Silently fail - context not ready yet
                return;
            }
        }
    });
})