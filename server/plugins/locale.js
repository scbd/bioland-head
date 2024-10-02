
export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook("request", async (event) => {

        const skipPaths = ['/_ipx','/api','/__nuxt_error','/_nuxt','/sites','/images','/favicon.ico'];

        for(let path of skipPaths)
            if(event.path.startsWith(path)) return;

        await isValidLocalePrefix();


        function isValidLocalePrefix(){
            const host = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   ctx         = getContext(event) // getContext(event)?.locales?.length? getContext(event) : await  useStorage('context').getItem(host);
            const defaultLocale = ctx.defaultLocale;
            const isValid       = ctx?.locales?.includes(event.path.split('/')[1]);

            if(isValid || event.path==='/' || !ctx?.locales?.length) return;


            return sendRedirect(event, `/${defaultLocale}${event.path}`, 301);
        }
    });
})