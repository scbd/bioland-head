

export default cachedEventHandler(async (event) => {
        try{
            const query             = getQuery      (event);
            const ctx               = getContext    (event);

            if(query?.schemas?.length && !query?.drupalInternalIds?.length)
                query.drupalInternalIds = Array.isArray(query.schemas)? query.schemas : [query.schemas];

            return useContentTypeList({ ...ctx, ...query });
        }
        catch (e) {

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/list/content/index.get.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/list/content/index.get.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    
    },
    // listCache
)
