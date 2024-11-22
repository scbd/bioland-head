

export default cachedEventHandler(async (event) => {
    try{
        const query            = getQuery      (event);
        const drupalInternalId = getRouterParam(event, 'drupalInternalId');
        const ctx              = getContext    (event);

        return useMediaTypeList({ ...ctx, ...query, drupalInternalId });
    }
    catch (e) {
        const   drupalInternalId        = getRouterParam(event, 'drupalInternalId')

        const { siteCode, locale } = getContext(event);
        const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
        const   requestUrl         = new URL(getRequestURL(event));
        const { pathname }         = requestUrl;
        const { baseHost, env }    = useRuntimeConfig().public;

        console.error(`${host}/server/api/list/content/[${drupalInternalId}].get.js`, e);

        throw createError({
            statusCode    : e.statusCode,
            statusMessage : e.statusMessage,
            message       : `${host}/server/api/list/content/[${drupalInternalId}].get.js`,
            data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
            fatal         : true
        }); 
    }
    
}, 
// listCache
)
