
export default cachedEventHandler(async (event) => {
        try{
            const query      = getQuery      (event);
            const ctx        = getContext    (event);

            ctx.topicId = getRouterParam(event, 'topicId');

            const topic    = await useDrupalTopics ({event,...ctx,...query })
            topic.comments = await useDrupalForumComments({event,...ctx,...query })

            return topic

        }
        catch (e) {
            const   topicId            = getRouterParam(event, 'topicId');
            const   forumAlias         = getRouterParam(event, 'forumAlias');
            
            const { siteCode, locale } = getContext(event);
            const   host               = getRequestHeader(event, 'x-forwarded-host') || getRequestHeader(event, 'host');
            const   requestUrl         = new URL(getRequestURL(event));
            const { pathname }         = requestUrl;
            const { baseHost, env }    = useRuntimeConfig().public;

            console.error(`${host}/server/api/forums/[${forumAlias}]/[${topicId}].get.js`, e);

            throw createError({
                statusCode    : e.statusCode,
                statusMessage : e.statusMessage,
                message       : `${host}/server/api/forums/[${forumAlias}]/[${topicId}].get.js`,
                data          : { siteCode, locale, host, baseHost, env, pathname, requestUrl, errorData:e.data }
            }); 
        }
    
    },
        forumsCache
    )
