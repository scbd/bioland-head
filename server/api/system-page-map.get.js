export default defineEventHandler(async (event) => {
    try{
        const ctx  =  await getContext(event)
        // consola.warn('ctx.localizedHost',ctx.localizedHost)
       // const systemPageMap = await getSystemPagesMap(ctx)

        return ctx.localizedHost? getSystemPagesMap(ctx) : ctx//{}//systemPageMap
    }
    catch (e) {
        const { siteCode, locale } = getContext(event);
        const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
        const   requestUrl         = new URL(getRequestURL(event));
        const { pathname }         = requestUrl;
        const { baseHost, env }    = useRuntimeConfig().public;

        console.error(`${host}/server/api/me.get.js`, e);

        throw createError({
            statusCode    : e.statusCode,
            statusMessage : e.statusMessage,
            message       : `${host}/server/api/me.get.js: `+e.message,
            data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
        }); 
    }
    
})
