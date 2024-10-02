
export default cachedEventHandler(async (event) => {
        try{
            const context = getContext(event);

            return getBchMenus(context)
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/menus/bch.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/menus/bch.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
            }); 
        }
    },
    externalCache
)
