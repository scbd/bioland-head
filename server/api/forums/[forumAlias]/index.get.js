
export default cachedEventHandler(async (event) => {
        try{

            const forumAlias = getRouterParam(event, 'forumAlias')
            const query      = getQuery      (event);
            const ctx        = getContext    (event);

            ctx.forumAlias = getRouterParam(event, 'forumAlias')

            await addForumIdentifierToContext(ctx)


            return useDrupalForums({...ctx,...query })
        }
        catch (e) {
            const   forumAlias         = getRouterParam(event, 'forumAlias')

            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/forums/[${forumAlias}]/index.get.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/forums/[${forumAlias}]/index.get.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data },
                fatal         : true
            }); 
        }
    },
    // forumsCache
)
